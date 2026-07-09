export const meta = {
  name: 'plan-pipeline',
  description: 'Scout a rasifiters task into a per-surface scope brief, plan it, adversarially check the plan — returns brief + plan + verdict for user approval',
  whenToUse: 'The deterministic first half of the multiplex pipeline (see .claude/skills/multiplex/). Args: { task: string }. The BUILD half (implement → review) is orchestrated inline after the user approves the plan.',
  phases: [
    { title: 'Scout', detail: 'resolve task → per-surface scope brief via ICM manifests' },
    { title: 'Plan', detail: 'prescriptive per-surface plan from brief + SPECs' },
    { title: 'Adversary', detail: 'attack the plan; one revision round if blocking' },
  ],
}

// Tolerate stringified args (some harness paths deliver Workflow `args` as a JSON string).
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = { task: a } } }
if (!a?.task) throw new Error('plan-pipeline requires args.task')

phase('Scout')
const brief = await agent(
  `Task: ${a.task}\n\nProduce the scope brief.`,
  { agentType: 'scout', label: 'scout', phase: 'Scout' },
)
if (!brief) throw new Error('scout returned nothing')

phase('Plan')
const plan = await agent(
  `Task: ${a.task}\n\n${brief}\n\nProduce the plan.`,
  { agentType: 'planner', label: 'planner', phase: 'Plan' },
)
if (!plan) throw new Error('planner returned nothing')
if (plan.includes('BRIEF INSUFFICIENT')) return { brief, plan, verdict: null, status: 'brief-insufficient' }

phase('Adversary')
const verdict = await agent(
  `Task: ${a.task}\n\n${brief}\n\n${plan}\n\nAttack this plan.`,
  { agentType: 'plan-adversary', label: 'plan-adversary', phase: 'Adversary' },
)

// One bounded revision round on blocking objections — then it's the user's call.
if (verdict && verdict.includes('[BLOCKING]')) {
  log('blocking objections — one revision round')
  const revised = await agent(
    `Task: ${a.task}\n\n${brief}\n\nYour previous plan:\n${plan}\n\nAdversary verdict (fix every BLOCKING item):\n${verdict}\n\nProduce the revised plan.`,
    { agentType: 'planner', label: 'planner-rev', phase: 'Adversary' },
  )
  const verdict2 = await agent(
    `Task: ${a.task}\n\n${brief}\n\n${revised}\n\nAttack this revised plan.`,
    { agentType: 'plan-adversary', label: 'plan-adversary-rev', phase: 'Adversary' },
  )
  return { brief, plan: revised, verdict: verdict2, status: 'revised-once' }
}

return { brief, plan, verdict, status: 'clean' }
