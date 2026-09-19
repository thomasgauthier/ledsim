#include "Arduino.h"

#include <emscripten.h>
#include <cstdlib>

EM_JS(void, consoleLog, (const char* message), {
  const line = UTF8ToString(message);
  // Serial.println() flushes here. The host installs serialOutput to read what
  // the Sketch reports; the console still gets the line either way.
  if (typeof Module['serialOutput'] === 'function') Module['serialOutput'](line);
  console.log(line);
});

EM_JS(int, readButtonPin, (int pin), {
  return typeof Module['readPin'] === 'function' ? Module['readPin'](pin) : 1;
});

EM_JS(int, readAnalogPin, (), {
  return Math.floor(Math.random() * 1024);
});

EM_JS(int, serialAvailable, (), {
  return typeof Module['serialAvailable'] === 'function' ? Module['serialAvailable']() : 0;
});

EM_JS(int, serialRead, (), {
  return typeof Module['serialRead'] === 'function' ? Module['serialRead']() : -1;
});

namespace {
const double startedAt = emscripten_get_now();
}

HardwareSerial Serial;

void HardwareSerial::begin(unsigned long) {}

void HardwareSerial::println() {
  consoleLog(buffer_.c_str());
  buffer_.clear();
}

int HardwareSerial::available() {
  return serialAvailable();
}

int HardwareSerial::read() {
  return serialRead();
}

void String::trim() {
  const char* whitespace = " \t\r\n";
  const size_t first = value_.find_first_not_of(whitespace);
  if (first == std::string::npos) {
    value_.clear();
    return;
  }
  value_ = value_.substr(first, value_.find_last_not_of(whitespace) - first + 1);
}

unsigned long millis() {
  return static_cast<unsigned long>(emscripten_get_now() - startedAt);
}

void delay(unsigned long milliseconds) {
  emscripten_sleep(milliseconds);
}

void pinMode(int, int) {}

int digitalRead(int pin) {
  return readButtonPin(pin);
}

int analogRead(int) {
  return readAnalogPin();
}

void randomSeed(unsigned long seed) {
  if (seed != 0) std::srand(seed);
}

long random(long maximum) {
  return maximum > 0 ? std::rand() % maximum : 0;
}

long random(long minimum, long maximum) {
  return minimum < maximum ? minimum + random(maximum - minimum) : minimum;
}
