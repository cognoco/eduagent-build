const { TestEnvironment } = require('jest-environment-node');

const FAKEABLE_GLOBALS = [
  'Date',
  'Intl',
  'performance',
  'queueMicrotask',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
];

const FAKEABLE_PROCESS_APIS = ['hrtime', 'nextTick'];

function captureDescriptors(target, propertyNames) {
  return propertyNames.flatMap((propertyName) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyName);
    if (descriptor) {
      return [[propertyName, descriptor]];
    }
    if (propertyName in target) {
      return [
        [
          propertyName,
          {
            configurable: true,
            enumerable: false,
            value: target[propertyName],
            writable: true,
          },
        ],
      ];
    }
    return [];
  });
}

function restoreDescriptors(target, descriptors) {
  for (const [propertyName, descriptor] of descriptors) {
    Object.defineProperty(target, propertyName, descriptor);
  }
}

function preserveInstalledFakeTimerProperties(target, propertyNames) {
  for (const propertyName of propertyNames) {
    const installedFake = target[propertyName];
    if (
      installedFake &&
      Object.prototype.hasOwnProperty.call(installedFake, 'hadOwnProperty')
    ) {
      // Node 26 contextified globals report inherited timer properties to
      // Sinon. Make uninstall restore its captured real value instead of
      // deleting the property before descriptor restoration can run.
      installedFake.hadOwnProperty = true;
    }
  }
}

class ApiTestEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.realGlobalDescriptors = captureDescriptors(
      this.global,
      FAKEABLE_GLOBALS,
    );
    this.realProcessDescriptors = captureDescriptors(
      this.global.process,
      FAKEABLE_PROCESS_APIS,
    );
  }

  handleTestEvent(event) {
    if (event.name !== 'test_done') {
      return;
    }

    preserveInstalledFakeTimerProperties(this.global, FAKEABLE_GLOBALS);

    try {
      this.fakeTimersModern?.useRealTimers();
      this.fakeTimers?.useRealTimers();
    } finally {
      restoreDescriptors(this.global, this.realGlobalDescriptors);
      restoreDescriptors(this.global.process, this.realProcessDescriptors);
    }
  }
}

module.exports = ApiTestEnvironment;
