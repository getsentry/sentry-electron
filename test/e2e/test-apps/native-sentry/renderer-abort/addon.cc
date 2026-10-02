#include <node_api.h>
#include <stdlib.h>

namespace demo {

napi_value Method(napi_env env, napi_callback_info args) {
  abort();
  return nullptr;
}

napi_value init(napi_env env, napi_value exports) {
  napi_value fn;
  if (napi_create_function(env, nullptr, 0, Method, nullptr, &fn) != napi_ok) {
    return nullptr;
  }
  if (napi_set_named_property(env, exports, "abort", fn) != napi_ok) {
    return nullptr;
  }
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

} // namespace demo
