type InngestHandler = (...args: unknown[]) => unknown;

export interface CapturedInngestFunction {
  opts: unknown;
  trigger: unknown;
  handler: InngestHandler;
}

export interface CapturedInngestSend {
  payload: unknown;
}

export interface InngestTransportCaptureOptions {
  sendResult?: unknown;
  sendError?: unknown;
}

function throwTransportError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error(String(error));
}

export function createInngestTransportCapture(
  options: InngestTransportCaptureOptions = {},
) {
  const sentEvents: CapturedInngestSend[] = [];
  const functions: CapturedInngestFunction[] = [];
  let sendError = options.sendError;
  let sendResult = options.sendResult;

  const inngest = {
    async send(payload: unknown): Promise<unknown> {
      sentEvents.push({ payload });
      if (sendError !== undefined) {
        throwTransportError(sendError);
      }
      return sendResult;
    },
    createFunction(
      opts: unknown,
      trigger: unknown,
      handler: InngestHandler,
    ): InngestHandler & {
      opts: unknown;
      trigger: unknown;
      fn: InngestHandler;
      getConfig: () => unknown[];
    } {
      functions.push({ opts, trigger, handler });
      return Object.assign(handler, {
        opts,
        trigger,
        fn: handler,
        getConfig: () => [{ opts, trigger }],
      });
    },
  };

  return {
    inngest,
    sentEvents,
    functions,
    module: { inngest },
    clear(): void {
      sentEvents.length = 0;
      functions.length = 0;
      sendError = undefined;
      sendResult = options.sendResult;
    },
    setSendError(error: unknown): void {
      sendError = error;
    },
    setSendResult(result: unknown): void {
      sendResult = result;
    },
    sentPayloads(): unknown[] {
      return sentEvents.map((event) => event.payload);
    },
  };
}
