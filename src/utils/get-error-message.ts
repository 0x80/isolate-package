type ErrorWithMessage = {
  message: string;
};

export function getErrorMessage(error: unknown) {
  return toErrorWithMessage(error).message;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return typeof error === "object" && error !== null && "message" in error;
}

function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError)) return maybeError;

  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    /**
     * Fallback in case there’s an error stringifying the maybeError
     * like with circular references.
     */
    return new Error(String(maybeError));
  }
}
