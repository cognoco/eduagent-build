interface ProxyElement {
  getAttribute: (name: string) => string | null;
  tagName: string;
}

interface ProxyEvent {
  altKey: boolean;
  currentTarget: ProxyElement;
  key?: string;
  nativeEvent: { key?: string; type: string };
  persist: jest.Mock;
  preventDefault: jest.Mock;
  stopPropagation: jest.Mock;
  target: ProxyElement;
}

interface PressEventHandlers {
  onClick: (event: ProxyEvent) => void;
  onKeyDown: (event: ProxyEvent) => void;
}

interface PressResponderInstance {
  getEventHandlers: () => PressEventHandlers;
}

type PressResponderConstructor = new (config: {
  disabled?: boolean;
  onPress: (event: ProxyEvent) => void;
}) => PressResponderInstance;

type CreateDOMProps = (
  elementType: string,
  props: Record<string, unknown>,
) => Record<string, unknown>;

const createDOMProps = jest.requireActual<CreateDOMProps>(
  'react-native-web/dist/cjs/modules/createDOMProps',
);
const PressResponder = jest.requireActual<PressResponderConstructor>(
  'react-native-web/dist/cjs/modules/usePressEvents/PressResponder',
);

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const keyupListeners = new Map<string, (event: ProxyEvent) => void>();
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);

const exitActions = [
  {
    label: 'Play Again',
    routerMethod: 'replace',
    route: '/(app)/quiz/launch',
  },
  {
    label: 'Done',
    routerMethod: 'replace',
    route: '/(app)/practice',
  },
  {
    label: 'View History',
    routerMethod: 'push',
    route: { pathname: '/(app)/quiz/history', params: {} },
  },
] as const;

function makeTarget(role = 'button'): ProxyElement {
  return {
    getAttribute: (name) => (name === 'role' ? role : null),
    tagName: 'DIV',
  };
}

function makeEvent(
  target: ProxyElement,
  type: string,
  key?: string,
): ProxyEvent {
  return {
    altKey: false,
    currentTarget: target,
    key,
    nativeEvent: { key, type },
    persist: jest.fn(),
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    target,
  };
}

function activate(
  handlers: PressEventHandlers,
  method: 'Enter' | 'Space' | 'pointer',
): void {
  const target = makeTarget();

  if (method === 'pointer') {
    handlers.onClick(makeEvent(target, 'click'));
    return;
  }

  const key = method === 'Enter' ? 'Enter' : ' ';
  handlers.onKeyDown(makeEvent(target, 'keydown', key));
  const keyup = keyupListeners.get('keyup');
  expect(keyup).toBeDefined();
  keyup!(makeEvent(target, 'keyup', key));
}

describe('quiz-results exit actions — React Native Web Pressable proxy', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        addEventListener: (
          type: string,
          listener: (event: ProxyEvent) => void,
        ) => keyupListeners.set(type, listener),
        removeEventListener: (type: string) => keyupListeners.delete(type),
      },
      writable: true,
    });
  });

  afterAll(() => {
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
      return;
    }
    Reflect.deleteProperty(globalThis, 'document');
  });

  beforeEach(() => {
    keyupListeners.clear();
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
  });

  it('maps the screen prop contract to named, focusable buttons in logical order', () => {
    const domProps = exitActions.map(({ label }) =>
      createDOMProps('div', {
        accessibilityLabel: label,
        accessibilityRole: 'button',
        tabIndex: 0,
      }),
    );

    expect(domProps.map((props) => props['role'])).toEqual([
      'button',
      'button',
      'button',
    ]);
    expect(domProps.map((props) => props['aria-label'])).toEqual([
      'Play Again',
      'Done',
      'View History',
    ]);
    expect(domProps.map((props) => props['tabIndex'])).toEqual([0, 0, 0]);
    expect(
      domProps.every(
        (props) =>
          !props['style'] ||
          (props['style'] as Record<string, unknown>)['outline'] !== 'none',
      ),
    ).toBe(true);
  });

  it.each([
    ['Play Again', 'Enter'],
    ['Play Again', 'Space'],
    ['Play Again', 'pointer'],
    ['Done', 'Enter'],
    ['Done', 'Space'],
    ['Done', 'pointer'],
    ['View History', 'Enter'],
    ['View History', 'Space'],
    ['View History', 'pointer'],
  ] as const)(
    '%s handles %s activation with exactly one intended navigation',
    (label, method) => {
      const action = exitActions.find(
        (candidate) => candidate.label === label,
      )!;
      const handlers = new PressResponder({
        onPress: () => {
          if (action.routerMethod === 'replace') {
            mockRouterReplace(action.route);
          } else {
            mockRouterPush(action.route);
          }
        },
      }).getEventHandlers();

      activate(handlers, method);

      const expectedMock =
        action.routerMethod === 'replace' ? mockRouterReplace : mockRouterPush;
      const otherMock =
        action.routerMethod === 'replace' ? mockRouterPush : mockRouterReplace;
      expect(expectedMock).toHaveBeenCalledTimes(1);
      expect(expectedMock).toHaveBeenCalledWith(action.route);
      expect(otherMock).not.toHaveBeenCalled();
    },
  );

  it('suppresses keyboard and pointer activation while disabled', () => {
    const onPress = jest.fn();
    const handlers = new PressResponder({
      disabled: true,
      onPress,
    }).getEventHandlers();

    const disabledDomProps = createDOMProps('div', {
      'aria-disabled': true,
      accessibilityLabel: 'Done',
      accessibilityRole: 'button',
      tabIndex: -1,
    });
    expect(disabledDomProps['aria-disabled']).toBe(true);
    expect(disabledDomProps['tabIndex']).toBe(-1);

    handlers.onKeyDown(makeEvent(makeTarget(), 'keydown', 'Enter'));
    expect(keyupListeners.get('keyup')).toBeUndefined();
    handlers.onKeyDown(makeEvent(makeTarget(), 'keydown', ' '));
    expect(keyupListeners.get('keyup')).toBeUndefined();
    handlers.onClick(makeEvent(makeTarget(), 'click'));

    expect(onPress).not.toHaveBeenCalled();
  });
});
