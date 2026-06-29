const apiEnv = process.env.NEXT_PUBLIC_API_ENV ?? "local";
const localBase = process.env.NEXT_PUBLIC_API_BASE_URL_LOCAL ?? "http://127.0.0.1:5001/api";
// Migration: prod default points at the new Render service (rasifiters-api), not the
// legacy rasi-fiters-api host. Overridden by NEXT_PUBLIC_API_BASE_URL_PROD at deploy.
const prodBase = process.env.NEXT_PUBLIC_API_BASE_URL_PROD ?? "https://rasifiters-api.onrender.com/api";

export const API_BASE_URL = apiEnv === "prod" ? prodBase : localBase;

const loginMode = process.env.NEXT_PUBLIC_AUTH_LOGIN_MODE ?? "global";
const defaultLoginPath = loginMode === "app" ? "/auth/login/app" : "/auth/login/global";

export const AUTH_LOGIN_PATH =
  process.env.NEXT_PUBLIC_AUTH_LOGIN_PATH ?? defaultLoginPath;

export const PRIVACY_POLICY_URL =
  process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL ??
  "https://vinaysankar2004.github.io/RaSi-Fiters/";
