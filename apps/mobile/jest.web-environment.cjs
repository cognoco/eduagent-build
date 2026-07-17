const { TextDecoder, TextEncoder } = require('node:util');
const { TextDecoderStream, TextEncoderStream } = require('node:stream/web');
const { TestEnvironment } = require('jest-environment-jsdom');

/**
 * Expo's WinterCG bootstrap replaces these jsdom globals with lazy native
 * getters. Jest 30 rejects those getters when they later require a module
 * outside the test runtime. Pin the standards-compatible jsdom/Node values for
 * the focused react-native-web integration test before setupFiles execute.
 */
class WebTestEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);

    const pinnedGlobals = {
      TextDecoder,
      TextDecoderStream,
      TextEncoder,
      TextEncoderStream,
      URL: this.global.URL,
      URLSearchParams: this.global.URLSearchParams,
    };

    for (const [name, value] of Object.entries(pinnedGlobals)) {
      Object.defineProperty(this.global, name, {
        value,
        configurable: false,
        enumerable: false,
        writable: true,
      });
    }
  }
}

module.exports = WebTestEnvironment;
