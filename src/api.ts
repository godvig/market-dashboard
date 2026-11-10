import { demoApi } from "./demoApi";
import { liveApi } from "./liveApi";

/** Build with VITE_DEMO=1 to run without a server, on made-up prices. */
export const IS_DEMO = Boolean(import.meta.env.VITE_DEMO);

export const api = IS_DEMO ? demoApi : liveApi;
