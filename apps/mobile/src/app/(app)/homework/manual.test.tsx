import {
  act,
  fireEvent,
  screen,
  type RenderAPI,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';

import { renderScreen } from '../../../test-utils/screen-render';
import {
  extractJsonBody,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';
import ManualHomeworkScreen from './manual';

const ORIGINAL_E2E_FLAG = process.env.EXPO_PUBLIC_E2E;
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockRedirect = jest.fn();
let mockSearchParams: Record<string, string | string[] | undefined> = {};

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    const { View } = require('react-native');
    mockRedirect(href);
    return <View testID="manual-route-redirect" />;
  },
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

const SUBJECT_ID = '00000000-0000-7000-a000-000000000301';
const SCIENCE_SUBJECT_ID = '00000000-0000-7000-a000-000000000302';
const SUBJECT_NAME = 'Mathematics';
const PROBLEM = 'Solve 3x + 7 = 22';

function makeSubject(id: string, name: string, status = 'active') {
  return {
    id,
    profileId: '00000000-0000-7000-a000-000000000201',
    name,
    status,
    pedagogyMode: 'socratic',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
  };
}

describe('ManualHomeworkScreen', () => {
  const cleanups: Array<() => void> = [];

  function renderManual(): RenderAPI {
    const rendered = renderScreen(<ManualHomeworkScreen />);
    cleanups.push(rendered.cleanup);
    return rendered.result;
  }

  beforeEach(() => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    mockSearchParams = {
      entrySource: 'mentor',
      returnTo: 'mentor',
      subjectId: SUBJECT_ID,
      subjectName: SUBJECT_NAME,
    };
  });

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    jest.clearAllMocks();
    if (ORIGINAL_E2E_FLAG === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
    } else {
      process.env.EXPO_PUBLIC_E2E = ORIGINAL_E2E_FLAG;
    }
  });

  it('fails closed to the camera route when the direct route is opened outside E2E', () => {
    process.env.EXPO_PUBLIC_E2E = 'false';

    renderManual();

    expect(screen.getByTestId('manual-route-redirect')).toBeTruthy();
    expect(mockRedirect).toHaveBeenCalledWith({
      pathname: '/(app)/homework/camera',
      params: mockSearchParams,
    });
  });

  it('opens the exact empty manual-entry case and cancels back to Mentor', () => {
    renderManual();

    expect(screen.getByTestId('homework-entry-mode-manual')).toBeTruthy();
    expect(screen.getByTestId('homework-manual-entry-empty')).toBeTruthy();
    expect(screen.getByTestId('result-text-input').props.value).toBe('');
    // WI-2551: shared transcription-only mic renders with the problem field.
    expect(screen.getByTestId('homework-manual-problem-mic')).toBeTruthy();

    fireEvent.press(screen.getByTestId('manual-entry-cancel'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
  });

  it('starts one associated manual homework session without image or OCR data', () => {
    renderManual();

    fireEvent.changeText(screen.getByTestId('result-text-input'), PROBLEM);
    fireEvent.press(screen.getByTestId('confirm-button'));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const destination = mockReplace.mock.calls[0]?.[0] as {
      pathname: string;
      params: Record<string, string | undefined>;
    };
    expect(destination.pathname).toBe('/(app)/session');
    expect(destination.params).toEqual(
      expect.objectContaining({
        mode: 'homework',
        subjectId: SUBJECT_ID,
        subjectName: SUBJECT_NAME,
        problemText: PROBLEM,
        entrySource: 'mentor',
        returnTo: 'mentor',
      }),
    );
    expect(JSON.parse(destination.params.homeworkProblems ?? '[]')).toEqual([
      expect.objectContaining({
        text: PROBLEM,
        originalText: null,
        source: 'manual',
        selectedMode: null,
      }),
    ]);
    expect(destination.params.captureSource).toBeUndefined();
    expect(destination.params.imageUri).toBeUndefined();
    expect(destination.params.imageMimeType).toBeUndefined();
    expect(destination.params.ocrText).toBeUndefined();
  });

  it('[WI-2196] lets a Mentor-preselected subject be changed without losing the problem draft', async () => {
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: {
          subjects: [
            makeSubject(SUBJECT_ID, SUBJECT_NAME),
            makeSubject(SCIENCE_SUBJECT_ID, 'Science'),
          ],
        },
      },
    });
    cleanups.push(rendered.cleanup);

    fireEvent.changeText(screen.getByTestId('result-text-input'), PROBLEM);
    fireEvent.press(screen.getByTestId('homework-change-subject'));

    await waitFor(() => {
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy();
      expect(screen.getByTestId(`subject-pick-${SUBJECT_ID}`)).toBeTruthy();
    });
    expect(screen.getByTestId('result-text-input').props.value).toBe(PROBLEM);
    expect(
      screen.queryByTestId('homework-subject-resolution-ready'),
    ).toBeNull();
  });

  it('[WI-2196] creates and selects the typed subject instead of adopting an unrelated existing subject', async () => {
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: (_url: string, init?: RequestInit) =>
          init?.method === 'POST'
            ? {
                subject: {
                  id: SUBJECT_ID,
                  profileId: '00000000-0000-7000-a000-000000000201',
                  name: 'Algebra',
                  status: 'active',
                  pedagogyMode: 'socratic',
                  createdAt: '2026-07-20T00:00:00.000Z',
                  updatedAt: '2026-07-20T00:00:00.000Z',
                },
                structureType: 'broad',
              }
            : {
                subjects: [
                  {
                    id: '00000000-0000-7000-a000-000000000302',
                    profileId: '00000000-0000-7000-a000-000000000201',
                    name: 'Science',
                    status: 'active',
                    pedagogyMode: 'socratic',
                    createdAt: '2026-07-20T00:00:00.000Z',
                    updatedAt: '2026-07-20T00:00:00.000Z',
                  },
                ],
              },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() => {
      expect(
        screen.getByTestId('subject-pick-00000000-0000-7000-a000-000000000302'),
      ).toBeTruthy();
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy();
    });
    expect(
      screen.queryByTestId('homework-subject-resolution-ready'),
    ).toBeNull();

    fireEvent.changeText(screen.getByTestId('result-text-input'), PROBLEM);
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      'Algebra',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));

    await waitFor(() => {
      expect(
        screen.getByTestId('homework-subject-resolution-ready'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('homework-subject-resolution-name'),
      ).toHaveTextContent('Algebra');
    });

    const createCalls = fetchCallsMatching(
      rendered.routedFetch,
      'subjects',
    ).filter((call) => call.init?.method === 'POST');
    expect(createCalls).toHaveLength(1);
    expect(
      extractJsonBody<{ name: string; rawInput: string }>(createCalls[0]?.init),
    ).toEqual({ name: 'Algebra', rawInput: 'Algebra' });
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('confirm-button'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: expect.objectContaining({
        subjectId: SUBJECT_ID,
        subjectName: 'Algebra',
        problemText: PROBLEM,
      }),
    });
  });

  it('[WI-2196] reuses a case-insensitive exact subject name without a duplicate POST', async () => {
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: { subjects: [makeSubject(SCIENCE_SUBJECT_ID, 'Science')] },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() =>
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      '  science ',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));

    await waitFor(() =>
      expect(
        screen.getByTestId('homework-subject-resolution-name'),
      ).toHaveTextContent('Science'),
    );
    expect(
      fetchCallsMatching(rendered.routedFetch, 'subjects').filter(
        (call) => call.init?.method === 'POST',
      ),
    ).toHaveLength(0);
  });

  it('[WI-2196] preserves both inputs and permits retry after typed-subject creation fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    let shouldFail = true;
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: (_url: string, init?: RequestInit) => {
          if (init?.method !== 'POST') {
            return { subjects: [makeSubject(SCIENCE_SUBJECT_ID, 'Science')] };
          }
          if (shouldFail) {
            return new Response(
              JSON.stringify({ code: 'UPSTREAM', message: 'Please try again' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            );
          }
          return {
            subject: makeSubject(SUBJECT_ID, 'Algebra'),
            structureType: 'broad',
          };
        },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() =>
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy(),
    );
    fireEvent.changeText(screen.getByTestId('result-text-input'), PROBLEM);
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      'Algebra',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(screen.getByTestId('result-text-input').props.value).toBe(PROBLEM);
    expect(screen.getByTestId('homework-subject-name-input').props.value).toBe(
      'Algebra',
    );
    expect(mockReplace).not.toHaveBeenCalled();

    shouldFail = false;
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));
    await waitFor(() =>
      expect(
        screen.getByTestId('homework-subject-resolution-name'),
      ).toHaveTextContent('Algebra'),
    );
    expect(
      fetchCallsMatching(rendered.routedFetch, 'subjects').filter(
        (call) => call.init?.method === 'POST',
      ),
    ).toHaveLength(2);

    alertSpy.mockRestore();
  });

  it('[WI-2196] preserves the draft and existing choices when the subject limit rejects creation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: (_url: string, init?: RequestInit) =>
          init?.method === 'POST'
            ? new Response(
                JSON.stringify({
                  code: 'SUBJECT_LIMIT_EXCEEDED',
                  message: 'You can have up to 25 subjects',
                }),
                {
                  status: 409,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            : { subjects: [makeSubject(SCIENCE_SUBJECT_ID, 'Science')] },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() =>
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy(),
    );
    fireEvent.changeText(screen.getByTestId('result-text-input'), PROBLEM);
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      'Algebra',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(screen.getByTestId('result-text-input').props.value).toBe(PROBLEM);
    expect(screen.getByTestId('homework-subject-name-input').props.value).toBe(
      'Algebra',
    );
    expect(
      screen.getByTestId(`subject-pick-${SCIENCE_SUBJECT_ID}`).props
        .accessibilityState,
    ).toEqual({ disabled: false });

    fireEvent.press(screen.getByTestId(`subject-pick-${SCIENCE_SUBJECT_ID}`));
    await waitFor(() =>
      expect(
        screen.getByTestId('homework-subject-resolution-name'),
      ).toHaveTextContent('Science'),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('[WI-2196] ignores a double tap while direct-manual subject creation is in flight', async () => {
    let finishCreate:
      | ((value: {
          subject: ReturnType<typeof makeSubject>;
          structureType: 'broad';
        }) => void)
      | undefined;
    const pendingCreate = new Promise<{
      subject: ReturnType<typeof makeSubject>;
      structureType: 'broad';
    }>((resolve) => {
      finishCreate = resolve;
    });
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: (_url: string, init?: RequestInit) =>
          init?.method === 'POST'
            ? pendingCreate
            : { subjects: [makeSubject(SCIENCE_SUBJECT_ID, 'Science')] },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() =>
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      'Algebra',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));

    await waitFor(() =>
      expect(
        fetchCallsMatching(rendered.routedFetch, 'subjects').filter(
          (call) => call.init?.method === 'POST',
        ),
      ).toHaveLength(1),
    );
    await act(async () => {
      finishCreate?.({
        subject: makeSubject(SUBJECT_ID, 'Algebra'),
        structureType: 'broad',
      });
    });
    await waitFor(() =>
      expect(
        screen.getByTestId('homework-subject-resolution-name'),
      ).toHaveTextContent('Algebra'),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('[WI-2196] keeps unrelated subject rows and typed input inert while creation is in flight', async () => {
    let finishCreate:
      | ((value: {
          subject: ReturnType<typeof makeSubject>;
          structureType: 'broad';
        }) => void)
      | undefined;
    const pendingCreate = new Promise<{
      subject: ReturnType<typeof makeSubject>;
      structureType: 'broad';
    }>((resolve) => {
      finishCreate = resolve;
    });
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: (_url: string, init?: RequestInit) =>
          init?.method === 'POST'
            ? pendingCreate
            : { subjects: [makeSubject(SCIENCE_SUBJECT_ID, 'Science')] },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() =>
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      'Algebra',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));

    await waitFor(() => {
      expect(
        screen.getByTestId(`subject-pick-${SCIENCE_SUBJECT_ID}`).props
          .accessibilityState,
      ).toEqual({ disabled: true });
      expect(
        screen.getByTestId('homework-subject-name-input').props.editable,
      ).toBe(false);
    });
    fireEvent.press(screen.getByTestId(`subject-pick-${SCIENCE_SUBJECT_ID}`));
    expect(screen.queryByTestId('homework-subject-resolution-name')).toBeNull();

    await act(async () => {
      finishCreate?.({
        subject: makeSubject(SUBJECT_ID, 'Algebra'),
        structureType: 'broad',
      });
    });
    await waitFor(() =>
      expect(
        screen.getByTestId('homework-subject-resolution-name'),
      ).toHaveTextContent('Algebra'),
    );
  });

  it('[WI-2196] does not revive a cancelled draft when subject creation resolves late', async () => {
    let finishCreate:
      | ((value: {
          subject: ReturnType<typeof makeSubject>;
          structureType: 'broad';
        }) => void)
      | undefined;
    const pendingCreate = new Promise<{
      subject: ReturnType<typeof makeSubject>;
      structureType: 'broad';
    }>((resolve) => {
      finishCreate = resolve;
    });
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: (_url: string, init?: RequestInit) =>
          init?.method === 'POST'
            ? pendingCreate
            : { subjects: [makeSubject(SCIENCE_SUBJECT_ID, 'Science')] },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() =>
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      'Algebra',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));
    await waitFor(() =>
      expect(
        fetchCallsMatching(rendered.routedFetch, 'subjects').filter(
          (call) => call.init?.method === 'POST',
        ),
      ).toHaveLength(1),
    );
    fireEvent.press(screen.getByTestId('manual-entry-cancel'));

    await act(async () => {
      finishCreate?.({
        subject: makeSubject(SUBJECT_ID, 'Algebra'),
        structureType: 'broad',
      });
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
  });

  it('[WI-2196] suppresses a stale creation alert when cancel wins during reconciliation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    let rejectCreate: ((error: Error) => void) | undefined;
    let finishRefetch:
      | ((value: { subjects: ReturnType<typeof makeSubject>[] }) => void)
      | undefined;
    const pendingCreate = new Promise<never>((_resolve, reject) => {
      rejectCreate = reject;
    });
    const pendingRefetch = new Promise<{
      subjects: ReturnType<typeof makeSubject>[];
    }>((resolve) => {
      finishRefetch = resolve;
    });
    let getCount = 0;
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: (_url: string, init?: RequestInit) => {
          if (init?.method === 'POST') return pendingCreate;
          getCount += 1;
          return getCount === 1
            ? { subjects: [makeSubject(SCIENCE_SUBJECT_ID, 'Science')] }
            : pendingRefetch;
        },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() =>
      expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      'Algebra',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));
    await act(async () => {
      rejectCreate?.(new Error('create failed'));
    });
    await waitFor(() => expect(getCount).toBe(2));
    expect(
      screen.getByTestId('homework-subject-resolve-button').props
        .accessibilityState,
    ).toEqual({ disabled: true });

    fireEvent.press(screen.getByTestId('manual-entry-cancel'));
    await act(async () => {
      finishRefetch?.({
        subjects: [makeSubject(SCIENCE_SUBJECT_ID, 'Science')],
      });
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
    alertSpy.mockRestore();
  });

  it('[WI-2196] creates a typed subject from the zero-active-Subject condition without leaving the draft', async () => {
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    // AC-required case: production useSubjects() calls the API with the
    // default includeInactive:false, so the server itself excludes
    // archived/paused Subjects — the real "finished loading, zero active"
    // response IS an empty array. This must be the fixture that proves the
    // Acceptance Criterion, not a client-side-filtered inactive-Subject list
    // (see the follow-up defense-in-depth test below for that case).
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: (_url: string, init?: RequestInit) =>
          init?.method === 'POST'
            ? {
                subject: {
                  id: SUBJECT_ID,
                  profileId: '00000000-0000-7000-a000-000000000201',
                  name: 'Algebra',
                  status: 'active',
                  pedagogyMode: 'socratic',
                  createdAt: '2026-07-20T00:00:00.000Z',
                  updatedAt: '2026-07-20T00:00:00.000Z',
                },
                structureType: 'broad',
              }
            : { subjects: [] },
      },
    });
    cleanups.push(rendered.cleanup);

    // The Subject list finished loading (server returned subjects: []) —
    // distinct from the loading case (subject-picker-loading) and from
    // having an active Subject (homework-subject-resolution-ready).
    await waitFor(() => {
      expect(screen.getByTestId('subject-picker-empty')).toBeTruthy();
    });
    expect(screen.queryByTestId('subject-picker-loading')).toBeNull();
    expect(
      screen.queryByTestId('homework-subject-resolution-ready'),
    ).toBeNull();
    expect(screen.getByText("You don't have any subjects yet.")).toBeTruthy();

    expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy();
    expect(screen.queryByTestId('subject-picker-create')).toBeNull();

    fireEvent.changeText(screen.getByTestId('result-text-input'), PROBLEM);
    expect(
      screen.getByTestId('confirm-button').props.accessibilityState,
    ).toEqual({ disabled: true });
    fireEvent.changeText(
      screen.getByTestId('homework-subject-name-input'),
      'Algebra',
    );
    fireEvent.press(screen.getByTestId('homework-subject-resolve-button'));

    await waitFor(() => {
      expect(
        screen.getByTestId('homework-subject-resolution-ready'),
      ).toBeTruthy();
    });
    expect(screen.getByTestId('result-text-input').props.value).toBe(PROBLEM);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('defense-in-depth: also shows inline creation when the client-side active filter zeroes out a loaded list', async () => {
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    // Additional coverage, NOT a substitute for the AC-required subjects:[]
    // case above: proves the screen's own `status === 'active'` filter (not
    // just an empty server response) also reaches the same empty state, in
    // case a caller ever requests includeInactive:true here.
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: {
          subjects: [
            {
              id: '00000000-0000-7000-a000-000000000401',
              profileId: '00000000-0000-7000-a000-000000000201',
              name: 'Retired History',
              status: 'archived',
              pedagogyMode: 'socratic',
              createdAt: '2026-07-20T00:00:00.000Z',
              updatedAt: '2026-07-20T00:00:00.000Z',
            },
          ],
        },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() => {
      expect(screen.getByTestId('subject-picker-empty')).toBeTruthy();
    });
    expect(screen.queryByTestId('subject-picker-loading')).toBeNull();
    expect(
      screen.queryByTestId('homework-subject-resolution-ready'),
    ).toBeNull();

    expect(screen.getByTestId('homework-subject-name-input')).toBeTruthy();
    expect(screen.queryByTestId('subject-picker-create')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('[WI-2196] fails closed on subject-list load error so exact-name reuse cannot become a duplicate POST', async () => {
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: () =>
          new Response(
            JSON.stringify({ code: 'UPSTREAM', message: 'Unavailable' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          ),
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() =>
      expect(
        screen.getByTestId('subject-picker-load-error-retry'),
      ).toBeTruthy(),
    );
    expect(screen.queryByTestId('homework-subject-name-input')).toBeNull();
    fireEvent.press(screen.getByTestId('subject-picker-load-error-retry'));
    await waitFor(() => {
      expect(
        fetchCallsMatching(rendered.routedFetch, 'subjects').filter(
          (call) => call.init?.method !== 'POST',
        ).length,
      ).toBeGreaterThanOrEqual(2);
    });
    expect(
      fetchCallsMatching(rendered.routedFetch, 'subjects').filter(
        (call) => call.init?.method === 'POST',
      ),
    ).toHaveLength(0);
  });
});
