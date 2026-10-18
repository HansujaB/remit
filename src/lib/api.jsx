import { createContext, useContext } from "react";
export const ApiContext = createContext(null);
export const useApi = () => useContext(ApiContext);
export function userMessage(message = '') {
  return /configure|backend|api key|_KEY|_TOKEN|_TASK_ID|_ACTOR_ID|environment|Clerk keys|provider configuration|single-URL input/i.test(message)
    ? 'This action is temporarily unavailable. Please try again later.'
    : message || 'Something went wrong. Please try again.';
}
export function createApi(getToken) {
  return async (path, options = {}) => {
    const token = await getToken();
    if (!token) throw new Error("Your session expired. Please sign in again.");
    const { blob = false, ...init } = options;
    let response;
    try {
      response = await fetch(`/api${path}`, {
        ...init,
        headers: {
          ...(init.body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
        body:
          init.body && !(init.body instanceof FormData)
            ? JSON.stringify(init.body)
            : init.body,
      });
    } catch {
      throw new Error(
        "Unable to connect. Check your connection and try again.",
      );
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(userMessage(body.error));
    }
    return blob ? response.blob() : response.json();
  };
}
