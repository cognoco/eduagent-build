type StepCallback<T> = () => T | Promise<T>;
type StepResult = unknown | (() => unknown | Promise<unknown>);

export interface InngestStepRunCall {
  name: string;
}

export interface InngestStepSendEventCall {
  name: string;
  payload: unknown;
}

export interface InngestStepSleepCall {
  name: string;
  duration: string;
}

export interface InngestStepWaitForEventCall {
  name: string;
  options: unknown;
}

export interface InngestStepRunnerOptions {
  runResults?: Record<string, StepResult>;
  runErrors?: Record<string, unknown>;
  sendEventResult?: StepResult;
  sendEventErrors?: Record<string, unknown>;
  waitForEventResult?: StepResult;
  waitForEventResults?: Record<string, StepResult | StepResult[]>;
}

async function resolveStepResult(result: StepResult): Promise<unknown> {
  return typeof result === 'function' ? result() : result;
}

function throwStepError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error(String(error));
}

export function createInngestStepRunner(
  options: InngestStepRunnerOptions = {},
) {
  const runCalls: InngestStepRunCall[] = [];
  const sendEventCalls: InngestStepSendEventCall[] = [];
  const sleepCalls: InngestStepSleepCall[] = [];
  const waitForEventCalls: InngestStepWaitForEventCall[] = [];

  const step = {
    async run<T>(name: string, callback: StepCallback<T>): Promise<T> {
      runCalls.push({ name });
      if (options.runErrors && name in options.runErrors) {
        throwStepError(options.runErrors[name]);
      }
      if (options.runResults && name in options.runResults) {
        return (await resolveStepResult(options.runResults[name])) as T;
      }
      return callback();
    },
    async sendEvent(name: string, payload: unknown): Promise<unknown> {
      sendEventCalls.push({ name, payload });
      if (options.sendEventErrors && name in options.sendEventErrors) {
        throwStepError(options.sendEventErrors[name]);
      }
      if (options.sendEventResult !== undefined) {
        return resolveStepResult(options.sendEventResult);
      }
      return undefined;
    },
    async sleep(name: string, duration: string): Promise<void> {
      sleepCalls.push({ name, duration });
    },
    async waitForEvent(name: string, optionsArg: unknown): Promise<unknown> {
      waitForEventCalls.push({ name, options: optionsArg });
      if (options.waitForEventResults && name in options.waitForEventResults) {
        const result = options.waitForEventResults[name];
        if (Array.isArray(result)) {
          const next = result.shift();
          return next === undefined ? null : resolveStepResult(next);
        }
        return resolveStepResult(result);
      }
      if (options.waitForEventResult !== undefined) {
        return resolveStepResult(options.waitForEventResult);
      }
      return null;
    },
  };

  const sendEventPayloads = (name: string): unknown[] =>
    sendEventCalls
      .filter((call) => call.name === name)
      .map((call) => call.payload);

  return {
    step,
    runCalls,
    sendEventCalls,
    sleepCalls,
    waitForEventCalls,
    runNames: () => runCalls.map((call) => call.name),
    sendEventPayloads,
    sendEventWasCalled: (name: string) => sendEventPayloads(name).length > 0,
  };
}
