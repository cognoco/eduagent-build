import {
  getCelebrationMotionPreset,
  getLoadingMotionPreset,
  resolveLoadingMotionPreset,
} from './motion-presets';

describe('motion presets', () => {
  it('keeps loading sizes tied to semantic roles', () => {
    expect(getLoadingMotionPreset('empty')).toEqual({
      role: 'empty',
      size: 160,
      placement: 'center',
    });
    expect(getLoadingMotionPreset('screen')).toEqual({
      role: 'screen',
      size: 150,
      placement: 'center',
    });
    expect(getLoadingMotionPreset('context')).toEqual({
      role: 'context',
      size: 96,
      placement: 'panel',
    });
    expect(getLoadingMotionPreset('inline')).toEqual({
      role: 'inline',
      size: 56,
      placement: 'inline',
    });
  });

  it('keeps celebration sizes separate from loading sizes', () => {
    expect(getCelebrationMotionPreset('hero')).toEqual({
      role: 'hero',
      size: 140,
      placement: 'center-burst',
    });
    expect(getCelebrationMotionPreset('context')).toEqual({
      role: 'context',
      size: 80,
      placement: 'contained',
    });
    expect(getCelebrationMotionPreset('inline')).toEqual({
      role: 'inline',
      size: 56,
      placement: 'inline',
    });
  });

  it('resolves loading roles from screen context', () => {
    expect(
      resolveLoadingMotionPreset({
        surface: 'overlay',
        contentDensity: 'dense',
      }).role,
    ).toBe('context');
    expect(
      resolveLoadingMotionPreset({
        surface: 'screen',
        contentDensity: 'none',
      }).role,
    ).toBe('empty');
    expect(
      resolveLoadingMotionPreset({
        surface: 'inline',
        contentDensity: 'dense',
      }).role,
    ).toBe('inline');
  });
});
