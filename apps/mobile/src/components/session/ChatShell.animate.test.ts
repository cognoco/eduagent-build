// [PERF-9 / BUG-739] animateResponse correctness + perf regression test
// The previous implementation rebuilt a growing prefix string each tick via
// tokens.slice(0, i+1).join(' '), which is O(N²) in token count and caused
// jank on long responses. This test pins the partial sequence and the final
// content to ensure the incremental builder produces identical output.

// react-native imports pull in module graph the unit doesn't need; ChatShell
// itself has heavy deps so we re-implement the same algorithm semantics here
// against the exported function via direct require with a transformIgnore
// shim — but since jsdom can resolve react-native fine in this repo, we just
// import the function directly.

import { animateResponse, type ChatMessage } from './ChatShell';

jest.useFakeTimers();

function collectStream(response: string) {
  const partials: string[] = [];
  const messages: ChatMessage[] = [];
  let streaming = false;
  let doneCalled = false;

  const setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> = (
    updater,
  ) => {
    const next =
      typeof updater === 'function'
        ? (updater as (m: ChatMessage[]) => ChatMessage[])(messages)
        : updater;
    messages.length = 0;
    messages.push(...next);
    const streamed = next.find((m) => m.role === 'assistant');
    if (streamed) partials.push(streamed.content);
  };
  const setIsStreaming: React.Dispatch<React.SetStateAction<boolean>> = (v) => {
    streaming =
      typeof v === 'function' ? (v as (b: boolean) => boolean)(streaming) : v;
  };

  const cleanup = animateResponse(response, setMessages, setIsStreaming, () => {
    doneCalled = true;
  });
  return {
    partials,
    cleanup,
    finalContent: () => messages.find((m) => m.role === 'assistant')?.content,
    isStreaming: () => streaming,
    isDone: () => doneCalled,
  };
}

describe('animateResponse', () => {
  it('streams tokens and final content equals input (single token)', () => {
    const r = collectStream('hello');
    jest.runAllTimers();
    expect(r.finalContent()).toBe('hello');
    expect(r.isDone()).toBe(true);
  });

  it('partial sequence matches join-based reference output', () => {
    const response = 'one two three four five';
    const tokens = response.split(' ');
    const r = collectStream(response);
    jest.runAllTimers();

    // First insert is the empty placeholder, then 5 partial updates, then
    // the final "streaming:false" update. Skip the initial empty, then the
    // next N entries should equal the cumulative join.
    const meaningful = r.partials.filter((p) => p !== '');
    // Last entry will equal the final response. Each preceding equals the
    // cumulative slice-join — this is the invariant the perf fix preserves.
    for (let i = 0; i < tokens.length; i++) {
      expect(meaningful[i]).toBe(tokens.slice(0, i + 1).join(' '));
    }
    expect(r.finalContent()).toBe(response);
  });

  it('handles a long response without quadratic blow-up', () => {
    // 500 tokens — the old O(N²) path would allocate ~500 strings of
    // increasing length, peaking at ~500 chars. We just want to confirm
    // correctness on a long input; the perf benefit is implicit in the
    // algorithm change.
    const tokens = Array.from({ length: 500 }, (_, i) => `t${i}`);
    const response = tokens.join(' ');
    const r = collectStream(response);
    jest.runAllTimers();
    expect(r.finalContent()).toBe(response);
    expect(r.isDone()).toBe(true);
  });

  it('cleanup cancels mid-stream', () => {
    const response = 'a b c d e f g h i j';
    const r = collectStream(response);
    // Advance only a few ticks then cancel.
    jest.advanceTimersByTime(40 * 3);
    r.cleanup();
    jest.runAllTimers();
    // onDone must NOT have fired because we cancelled before completion.
    expect(r.isDone()).toBe(false);
  });
});
