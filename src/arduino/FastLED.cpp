#include "FastLED.h"

#include <emscripten.h>

/*
 * Color, scaling and beat math adapted from FastLED (default Y1 rainbow and
 * FASTLED_SCALE8_FIXED=1): hsv2rgb.cpp.hpp, platforms/shared/{scale8,trig8}.h,
 * and fl/math/beat.h. Hardware color correction and dithering are not simulated.
 *
 * The MIT License (MIT)
 * Copyright (c) 2013 FastLED
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
namespace {
uint8_t scale8(uint8_t value, uint8_t scale) {
  return (uint16_t(value) * (uint16_t(scale) + 1)) >> 8;
}

uint8_t scale8Video(uint8_t value, uint8_t scale) {
  return ((uint16_t(value) * scale) >> 8) + ((value && scale) ? 1 : 0);
}

uint8_t sin8(uint8_t theta) {
  constexpr uint8_t table[] = {0, 49, 49, 41, 90, 27, 117, 10};
  uint8_t offset = (theta & 0x40) ? 255 - theta : theta;
  offset &= 0x3f;
  uint8_t sectionOffset = (offset & 0x0f) + ((theta & 0x40) ? 1 : 0);
  uint8_t section = (offset >> 4) * 2;
  int value = table[section] + ((table[section + 1] * sectionOffset) >> 4);
  return 128 + ((theta & 0x80) ? -value : value);
}
}

const CRGB CRGB::White{255, 255, 255};
const CRGB CRGB::Red{255, 0, 0};
const CRGB CRGB::Blue{0, 0, 255};
const CRGB CRGB::Black{0, 0, 0};
CFastLED FastLED;

CRGB::CRGB(const CHSV& hsv) {
  const uint8_t offset = (hsv.h & 0x1f) << 3;
  const uint8_t third = scale8(offset, 85);
  const uint8_t twoThirds = scale8(offset, 170);
  switch (hsv.h >> 5) {
    case 0: r = 255 - third; g = third; b = 0; break;
    case 1: r = 171; g = 85 + third; b = 0; break;
    case 2: r = 171 - twoThirds; g = 170 + third; b = 0; break;
    case 3: r = 0; g = 255 - third; b = third; break;
    case 4: r = 0; g = 171 - twoThirds; b = 85 + twoThirds; break;
    case 5: r = third; g = 0; b = 255 - third; break;
    case 6: r = 85 + third; g = 0; b = 171 - third; break;
    case 7: r = 170 + third; g = 0; b = 85 - third; break;
  }
  if (hsv.s != 255) {
    const uint8_t desaturation = scale8Video(255 - hsv.s, 255 - hsv.s);
    const uint8_t saturation = 255 - desaturation;
    r = scale8(r, saturation) + desaturation;
    g = scale8(g, saturation) + desaturation;
    b = scale8(b, saturation) + desaturation;
  }
  if (hsv.v != 255) {
    const uint8_t value = scale8Video(hsv.v, hsv.v);
    r = scale8(r, value);
    g = scale8(g, value);
    b = scale8(b, value);
  }
}

void CRGB::fadeToBlackBy(uint8_t amount) {
  r = scale8(r, 255 - amount);
  g = scale8(g, 255 - amount);
  b = scale8(b, 255 - amount);
}

CRGB& CRGB::nscale8_video(uint8_t scaledown) {
  r = scale8Video(r, scaledown);
  g = scale8Video(g, scaledown);
  b = scale8Video(b, scaledown);
  return *this;
}

void fill_solid(CRGB* leds, int count, const CRGB& color) {
  for (int i = 0; i < count; ++i) leds[i] = color;
}

uint8_t beatsin8(uint16_t bpm, uint8_t lowest, uint8_t highest,
                uint32_t timebase, uint8_t phaseOffset) {
  if (bpm < 256) bpm <<= 8;
  const uint32_t beat = (uint32_t(millis()) - timebase) * bpm * uint32_t(280);
  const uint8_t phase = (beat >> 24) + phaseOffset;
  return lowest + scale8(sin8(phase), highest - lowest);
}

EM_JS(void, presentLeds, (const CRGB* leds, int count, int brightness), {
  if (typeof Module['onLedFrame'] === 'function') {
    // Borrowed only for this synchronous call. The receiver owns its snapshot.
    Module['onLedFrame'](HEAPU8.subarray(leds, leds + count * 3), brightness);
  }
});

void CFastLED::show() {
  if (leds_ && count_ > 0) presentLeds(leds_, count_, brightness_);
}

void CFastLED::clear(bool writeData) {
  if (leds_ && count_ > 0) fill_solid(leds_, count_, CRGB::Black);
  if (writeData) show();
}
