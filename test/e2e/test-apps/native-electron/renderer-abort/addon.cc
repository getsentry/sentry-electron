#include <node_api.h>
#include <stdlib.h>

namespace demo
{
  napi_value Method(napi_env env, napi_callback_info args)
  {
    abort();
    return nullptr;
  }

  napi_value init(napi_env env, napi_value exports)
  {
    napi_status status;
    napi_value fn;
    status = napi_create_function(env, nullptr, 0, Method, nullptr, &fn);
    if (status != napi_ok)
      return nullptr;
    status = napi_set_named_property(env, exports, "abort", fn);
    if (status != napi_ok)
      return nullptr;
    return exports;
  }

  NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
}
