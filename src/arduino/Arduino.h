#pragma once

#include <cstdint>
#include <sstream>
#include <string>

constexpr int HIGH = 1;
constexpr int LOW = 0;
constexpr int INPUT = 0;
constexpr int OUTPUT = 1;
constexpr int INPUT_PULLUP = 2;
constexpr int A0 = 14;

// The Arduino core's min()/max() are macros; templates behave the same for
// well-formed calls without breaking the host's own headers. Deduced auto return
// keeps them by value - decltype() of the ternary would be a reference.
template <typename A, typename B>
auto min(A a, B b) {
  return a < b ? a : b;
}

template <typename A, typename B>
auto max(A a, B b) {
  return a > b ? a : b;
}

// Arduino's String, over the host's string type. Enough of it for the
// line-oriented serial input a Sketch on this bridge can observe.
class String {
 public:
  String() = default;
  String(const char* text) : value_(text) {}

  String& operator=(const char* text) {
    value_ = text;
    return *this;
  }
  String& operator+=(char character) {
    value_ += character;
    return *this;
  }
  bool operator==(const char* text) const { return value_ == text; }

  void trim();
  const char* c_str() const { return value_.c_str(); }
  size_t length() const { return value_.size(); }

 private:
  std::string value_;
};

class HardwareSerial {
 public:
  void begin(unsigned long baudRate);

  template <typename T>
  void print(const T& value) {
    std::ostringstream output;
    output << value;
    buffer_ += output.str();
  }

  template <typename T>
  void println(const T& value) {
    print(value);
    println();
  }

  void println();

  // Input comes from the host, which keeps the queue behind serialRead().
  int available();
  int read();

 private:
  std::string buffer_;
};

extern HardwareSerial Serial;

unsigned long millis();
void delay(unsigned long milliseconds);
void pinMode(int pin, int mode);
int digitalRead(int pin);
int analogRead(int pin);
void randomSeed(unsigned long seed);
long random(long maximum);
long random(long minimum, long maximum);
