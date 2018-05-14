Configuration
=============

To get started, you need to initialize the Electron SDK and declare your Sentry
DSN:

.. code-block:: javascript

    const { init } = require('@sentry/electron');
    init({ dsn: '___PUBLIC_DSN___' });

This code snippet has to be executed in every process you start in Electron.
Besides the main process, this includes renderers and other sub processes. Be
sure to initilalize the SDK as early as possible, so it can also catch errors
that happen during startup.

We recommend to put the initialization in a separate JavaScript module, to keep
configuration options consistent. This also allows to use it as preload script
when creating new ``BrowserWindow`` instances:

.. code-block:: javascript

    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, 'sentry.js')
      }
    });

After this, the SDK is ready to capture any uncaught exception and native
crashes that occur in those processes.

Node Integration
----------------

The SDK requires some NodeJS APIs to operate properly. When creating windows
without Node integration, the SDK must be loaded in a preload script, as
described above. Doing so also ensures that the SDK is loaded as early as
possible.

.. code-block:: javascript

    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        preload: path.join(__dirname, 'sentry.js')
      }
    });

Sandbox Mode
------------

`Sandbox mode`_ fully isolates the renderer processes from the operating system
using OS-specific methods. Since most node APIs require system access, they are
not available in sandbox mode, most notably ``require()``. See the linked
documentation for a detailed description of sandbox restrictions.

The Electron SDK can still be used from within a preload script. However, it
needs to be bundled into a single file using bundlers like Webpack or Rollup due
to the missing ``require()`` function. Please refer to the respective
documentation your chosen tool for all possible configuration options.

The SDK is written in a way that prevents bundlers from processing any code that
is only meant to be executed in the main process. The only remaining external
dependency is ``electron``, which must be explicitly excluded from inlining. For
Webpack, this would be:

.. code-block:: javascript

    module.exports = {
      externals: {
        electron: 'commonjs electron',
      },
      // ...
    };

Or for Rollup:

.. code-block:: javascript

    export default {
      external: ['electron'],
      plugins: [commonjs()],
      // ...
    };

Options
-------

To customize SDK behavior, simply pass additional options to the ``init()``
call. All available options are documented below:

.. describe:: enableJavaScript

    Enables JavaScript error reporting. Default: ``true``

    Based on the process type, this configures our JavaScript SDKs with sane
    defaults. In the main process (``process.type: 'browser'``), it uses the
    Node SDK. In renderer processes (``process.type: 'renderer'``), it uses the
    JavaScript SDK.

    If you need to use a specific configuration option of one of these SDKs, you
    can include it in the options object directly, as it will be passed down by
    ``init``.

    .. code-block:: javascript

        {
          enableJavaScript: true
        }

.. describe:: enableNative

    Enables reporting of native crashes. Default: ``true``

    This enables and configures the `Electron CrashReporter`_  to generate
    memory dumps when the app or a renderer crashes. Those dumps will be
    uploaded to Sentry for processing once the app restarts. Metadata, such as
    context information or breadcrumbs are automatically included.

    For more information on native crashes, see :doc:`native`.

    .. code-block:: javascript

        {
          enableNative: true
        }

.. describe:: release

    Explicitly set the version of your application to track it in Sentry.

    Note that the release ID must be unique within your organization. This is
    required to enable proper source map support. For more information, see
    :doc:`sourcemaps`.

    .. code-block:: javascript

        {
          release: '721e41770371db95eee98ca2707686226b993eda'
        }

.. describe:: environment

    Track the application environment in Sentry.

    This can be useful to distinguish prereleases and special builds from
    production apps. This works similar to tags.

    .. code-block:: javascript

        {
          environment: 'production'
        }

.. describe:: maxBreadcrumbs

    Set the maximum number of breadcrumbs captured by default. You can increase
    this to be as high as ``100``. Defaults to ``30``

    Note that breadcrumbs are kept in memory and periodically flushed in a cache
    file. This way, breadcrumbs can even be included when the entire application
    crashes. However, in very high-concurrency situations there is potential for
    significant memory and disk usage. If you find your application to generate
    large breadcrumbs, consider reducing ``maxBreadcrumbs`` the option.

    .. code-block:: javascript

        {
          maxBreadcrumbs: 20
        }

.. describe:: shouldSend

    A callback invoked during event submission, allowing to cancel it. If
    unspecified, all events will be sent to Sentry.

    This function is called for both captured errors and messages before all
    other callbacks. Note that the SDK might perform other actions after calling
    this function. Use ``beforeSend`` for notifications on events instead.

    .. code-block:: javascript

        {
          shouldSend: function (data) {
            return Math.random() > 0.5;
          }
        }

.. describe:: beforeSend

    A callback function that allows mutation of the event payload right before
    being sent to Sentry.

    This function is called after ``shouldSend`` and immediately precedes the
    actual event submission. You must return valid event payload from this
    callback. If you wish to cancel event submission instead, use
    ``shouldSend``.

    .. code-block:: javascript

        {
          beforeSend: function (data) {
            // add a user context
            data.user = {
              id: 1337,
              name: 'janedoe',
              email: 'janedoe@example.com'
            };
            return data;
          }
        }

.. describe:: afterSend

    A callback invoked after the event has been submitted. The second parameter
    contains a status that indicates whether submission was successful.

    .. code-block:: javascript

        {
          afterSend: function (data, status) {
            // status can be one of:
            //  - "unknown": The status could not be determined
            //  - "skipped": The event was skipped due to configuration or callbacks
            //  - "success": The event was sent to Sentry successfully
            //  - "rate_limit": The client is currently rate limited and will try again later
            //  - "invalid": The event could not be processed
            //  - "failed": A server-side error ocurred during submission
          }
        }

.. describe:: shouldAddBreadcrumb

    A callback allowing to skip breadcrumbs.

    This function is called for both manual and automatic breadcrumbs before all
    other callbacks. Note that the SDK might perform other actions after calling
    this function. Use ``beforeBreadcrumb`` for notifications on breadcrumbs
    instead.

    .. code-block:: javascript

        {
          shouldAddBreadcrumb: function (data) {
            return Math.random() > 0.5;
          }
        }

.. describe:: beforeBreadcrumb

    A callback function that allows mutation of the breadcrumb before adding it.

    This function is called after ``shouldAddBreadcrumb``. You must return valid
    breadcrumb from this callback. If you wish to omit this breadcrumb instead,
    use ``shouldAddBreadcrumb``.

    .. code-block:: javascript

        {
          beforeBreadcrumb: function (data) {
            data.level = "fatal";
            return data;
          }
        }

.. describe:: afterBreadcrumb

    A callback invoked after a breadcrumb has been added.

    .. code-block:: javascript

        {
          afterBreadcrumb: function (data) {
            // ...
          }
        }

.. _Sandbox mode: https://electronjs.org/docs/api/sandbox-option
.. _Electron CrashReporter: https://electronjs.org/docs/api/crash-reporter
