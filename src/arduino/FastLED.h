#pragma once

#include "Arduino.h"

// Channel order, as FastLED names it. The simulator always packs Frames as RGB,
// so the order is accepted and ignored, like the rest of the wire format.
enum EOrder { RGB, RBG, GRB, GBR, BRG, BGR };

// Only the controllers the Sketch names are simulated, with the same template
// shape FastLED uses so a Sketch can pass either the name or an alias template.
template <uint8_t Pin, EOrder Order>
struct WS2811 {};

struct CHSV {
  uint8_t h, s, v;
  CHSV(uint8_t hue, uint8_t saturation, uint8_t value)
      : h(hue), s(saturation), v(value) {}
};

struct CRGB {
  uint8_t r = 0, g = 0, b = 0;
  CRGB() = default;
  constexpr CRGB(uint8_t red, uint8_t green, uint8_t blue)
      : r(red), g(green), b(blue) {}
  // A packed 0xRRGGBB code, as FastLED reads it.
  constexpr CRGB(uint32_t colorcode)
      : r((colorcode >> 16) & 0xFF),
        g((colorcode >> 8) & 0xFF),
        b((colorcode >> 0) & 0xFF) {}
  CRGB(const CHSV& hsv);
  void fadeToBlackBy(uint8_t amount);
  CRGB& nscale8_video(uint8_t scaledown);
  static const CRGB White;
  static const CRGB Red;
  static const CRGB Blue;
  static const CRGB Black;
};

static_assert(sizeof(CRGB) == 3, "The browser bridge expects packed RGB bytes");

void fill_solid(CRGB* leds, int count, const CRGB& color);
uint8_t beatsin8(uint16_t bpm, uint8_t lowest = 0, uint8_t highest = 255,
                uint32_t timebase = 0, uint8_t phaseOffset = 0);

class CFastLED {
 public:
  // FastLED.addLeds<WS2811, DATA_PIN, RGB_ORDER>(leds, count), or with a chipset
  // alias template. The chipset, pin, and order are hardware facts the
  // simulator has no use for; only the buffer and its length matter.
  template <template <uint8_t, EOrder> class Chipset, uint8_t Pin, EOrder Order>
  CFastLED& addLeds(CRGB* leds, int count) {
    leds_ = leds;
    count_ = count;
    return *this;
  }

  void setBrightness(uint8_t brightness) { brightness_ = brightness; }
  void clear(bool writeData = false);
  void show();

 private:
  CRGB* leds_ = nullptr;
  int count_ = 0;
  uint8_t brightness_ = 255;
};

extern CFastLED FastLED;
