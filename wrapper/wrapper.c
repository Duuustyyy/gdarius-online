#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdbool.h>
#include <emscripten.h>
#include "libretro.h"

#define FB_MAX_W 1024
#define FB_MAX_H 512
#define AUDIO_MAX_FRAMES 8192

static char g_sys_dir[256]  = "/system";
static char g_save_dir[256] = "/saves";
static unsigned g_pixfmt = RETRO_PIXEL_FORMAT_0RGB1555;
static uint8_t  g_fb[FB_MAX_W * FB_MAX_H * 4];   /* RGBA8888 */
static unsigned g_w = 0, g_h = 0;
static int16_t  g_audio[AUDIO_MAX_FRAMES * 2];   /* stereo interleaved */
static unsigned g_audio_frames = 0;
static uint16_t g_pad[2] = {0, 0};
static double g_fps = 60.0, g_rate = 44100.0;

static void log_cb(enum retro_log_level level, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt); vfprintf(stderr, fmt, ap); va_end(ap);
}

static bool env_cb(unsigned cmd, void *data) {
  switch (cmd) {
  case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char **)data = g_sys_dir;  return true;
  case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:   *(const char **)data = g_save_dir; return true;
  case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:     g_pixfmt = *(unsigned *)data;      return true;
  case RETRO_ENVIRONMENT_GET_CAN_DUPE:         *(bool *)data = true;              return true;
  case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:  *(bool *)data = false;             return true;
  case RETRO_ENVIRONMENT_GET_VARIABLE:         ((struct retro_variable *)data)->value = NULL; return false;
  case RETRO_ENVIRONMENT_GET_LOG_INTERFACE:    ((struct retro_log_callback *)data)->log = log_cb; return true;
  case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS:   return true;
  case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:return true;
  case RETRO_ENVIRONMENT_SET_SERIALIZATION_QUIRKS: return true;
  default: return false;
  }
}

static void video_cb(const void *data, unsigned w, unsigned h, size_t pitch) {
  if (!data) return;                       /* duped frame: keep previous */
  if (w > FB_MAX_W) w = FB_MAX_W;
  if (h > FB_MAX_H) h = FB_MAX_H;
  g_w = w; g_h = h;
  for (unsigned y = 0; y < h; y++) {
    uint8_t *dst = g_fb + (size_t)y * w * 4;
    const uint8_t *row = (const uint8_t *)data + y * pitch;
    if (g_pixfmt == RETRO_PIXEL_FORMAT_RGB565) {
      const uint16_t *s = (const uint16_t *)row;
      for (unsigned x = 0; x < w; x++) {
        unsigned p = s[x], r = (p >> 11) & 31, g = (p >> 5) & 63, b = p & 31;
        *dst++ = (r << 3) | (r >> 2); *dst++ = (g << 2) | (g >> 4); *dst++ = (b << 3) | (b >> 2); *dst++ = 255;
      }
    } else if (g_pixfmt == RETRO_PIXEL_FORMAT_XRGB8888) {
      const uint32_t *s = (const uint32_t *)row;
      for (unsigned x = 0; x < w; x++) {
        uint32_t p = s[x];
        *dst++ = (p >> 16) & 255; *dst++ = (p >> 8) & 255; *dst++ = p & 255; *dst++ = 255;
      }
    } else {
      const uint16_t *s = (const uint16_t *)row;
      for (unsigned x = 0; x < w; x++) {
        unsigned p = s[x], r = (p >> 10) & 31, g = (p >> 5) & 31, b = p & 31;
        *dst++ = (r << 3) | (r >> 2); *dst++ = (g << 3) | (g >> 2); *dst++ = (b << 3) | (b >> 2); *dst++ = 255;
      }
    }
  }
}

static size_t audio_batch_cb(const int16_t *data, size_t frames) {
  size_t room = AUDIO_MAX_FRAMES - g_audio_frames;
  size_t n = frames < room ? frames : room;
  memcpy(g_audio + (size_t)g_audio_frames * 2, data, n * 4);
  g_audio_frames += (unsigned)n;
  return frames;
}
static void audio_cb(int16_t l, int16_t r) { int16_t s[2] = {l, r}; audio_batch_cb(s, 1); }
static void input_poll_cb(void) {}
static int16_t input_state_cb(unsigned port, unsigned device, unsigned index, unsigned id) {
  if (port > 1 || device != RETRO_DEVICE_JOYPAD) return 0;
  if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)g_pad[port];
  if (id < 16) return (g_pad[port] >> id) & 1;
  return 0;
}

EMSCRIPTEN_KEEPALIVE void gd_init(const char *sys, const char *sav) {
  strncpy(g_sys_dir, sys, 255);  strncpy(g_save_dir, sav, 255);
  retro_set_environment(env_cb);
  retro_set_video_refresh(video_cb);
  retro_set_audio_sample(audio_cb);
  retro_set_audio_sample_batch(audio_batch_cb);
  retro_set_input_poll(input_poll_cb);
  retro_set_input_state(input_state_cb);
  retro_init();
}
EMSCRIPTEN_KEEPALIVE int gd_load(const char *path) {
  struct retro_game_info g = { path, NULL, 0, NULL };
  if (!retro_load_game(&g)) return 0;
  struct retro_system_av_info av; retro_get_system_av_info(&av);
  g_fps = av.timing.fps; g_rate = av.timing.sample_rate;
  retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
  retro_set_controller_port_device(1, RETRO_DEVICE_JOYPAD);
  return 1;
}
EMSCRIPTEN_KEEPALIVE void gd_run(void) { g_audio_frames = 0; retro_run(); }
EMSCRIPTEN_KEEPALIVE void gd_set_pad(int port, int mask) { if (port >= 0 && port < 2) g_pad[port] = (uint16_t)mask; }
EMSCRIPTEN_KEEPALIVE uint8_t *gd_fb(void) { return g_fb; }
EMSCRIPTEN_KEEPALIVE int gd_fb_w(void) { return (int)g_w; }
EMSCRIPTEN_KEEPALIVE int gd_fb_h(void) { return (int)g_h; }
EMSCRIPTEN_KEEPALIVE int16_t *gd_audio(void) { return g_audio; }
EMSCRIPTEN_KEEPALIVE int gd_audio_frames(void) { return (int)g_audio_frames; }
EMSCRIPTEN_KEEPALIVE double gd_fps(void) { return g_fps; }
EMSCRIPTEN_KEEPALIVE double gd_sample_rate(void) { return g_rate; }
EMSCRIPTEN_KEEPALIVE int gd_state_size(void) { return (int)retro_serialize_size(); }
EMSCRIPTEN_KEEPALIVE int gd_serialize(void *buf, int size) { return retro_serialize(buf, (size_t)size); }
EMSCRIPTEN_KEEPALIVE int gd_unserialize(const void *buf, int size) { return retro_unserialize(buf, (size_t)size); }
EMSCRIPTEN_KEEPALIVE uint32_t gd_hash(const uint8_t *p, int n) {
  uint32_t h = 2166136261u; while (n-- > 0) { h ^= *p++; h *= 16777619u; } return h;
}