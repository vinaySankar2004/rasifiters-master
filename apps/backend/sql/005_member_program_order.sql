-- 005_member_program_order.sql
-- Per-member program-card ordering for the program-picker surfaces
-- (web /programs + iOS My Programs). Net-new post-parity enhancement (2026-07-05).
-- A dedicated table rather than a program_memberships column because global
-- admins see programs they have no membership row in. Written full-replace by
-- PUT /api/programs/order (last-write-wins across devices); rows vanish via FK
-- cascade on hard member/program deletes. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.member_program_order (
    member_id   uuid NOT NULL,
    program_id  uuid NOT NULL,
    position    integer NOT NULL,
    updated_at  timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT member_program_order_pkey PRIMARY KEY (member_id, program_id),
    CONSTRAINT member_program_order_member_id_fkey
        FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE,
    CONSTRAINT member_program_order_program_id_fkey
        FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE
);
