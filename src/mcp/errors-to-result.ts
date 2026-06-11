/**
 * The policy seam between the Civi domain context (which raises typed
 * `CiviError`s) and the MCP context (which speaks `ToolResult`s with
 * `isError: true`). Per spec Section 9: errors are caught at the tool
 * handler boundary, logged to stderr, surfaced to the LLM as structured
 * `isError` results, never swallowed.
 */
import { CiviApiError, CiviAuthError, CiviError, CiviTransportError } from "../civi/errors.js";
import type { Logger } from "../logging.js";
import type { ToolResult } from "./tools/list-entities.js";

type Handler<A> = (args: A) => Promise<ToolResult>;

const message = (toolName: string, err: unknown): string => {
  if (err instanceof CiviAuthError) {
    return `Authentication failed when calling ${toolName}: ${err.message}`;
  }
  if (err instanceof CiviApiError) {
    const suffix = err.errorCode === undefined ? "" : ` [${err.errorCode}]`;
    return `${err.entity}.${err.action} returned an error: ${err.message}${suffix}`;
  }
  if (err instanceof CiviTransportError) {
    return `Transport error calling ${toolName}: ${err.message}`;
  }
  if (err instanceof CiviError) {
    return `${toolName}: ${err.message}`;
  }
  return `Internal error in ${toolName} — see server logs for details.`;
};

export const wrapHandler = <A>(toolName: string, handler: Handler<A>, log: Logger): Handler<A> => {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      log.error({ tool: toolName, err }, "tool handler threw");
      return {
        content: [{ type: "text", text: message(toolName, err) }],
        isError: true,
      };
    }
  };
};
