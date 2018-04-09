.. sentry:edition:: hosted, on-premise

    .. class:: platform-electron

    Electron
    ========

``@sentry/electron`` is the official Sentry SDK for Electron applications. It
can capture JavaScript exceptions in the main process and renderers, as well as
collect native crash reports (Minidumps).

.. warning::
    This SDK is still in beta and undergoing active development. It is part of
    an early access preview for the `next generation JavaScript SDKs`_. Until
    the *1.x* stable release, APIs are still subject to change.

Installation
------------

The Electron SDK is distributed via `npm`:

.. code-block:: sh

    $ npm install --save @sentry/electron
    $ yarn add @sentry/electron

Our Sentry Wizard can help with the setup process. Make sure you have
installed the ``@sentry/wizard`` npm package globally, then run:

.. code-block:: sh

    $ npm install -g @sentry/wizard
    $ sentry-wizard --integration electron

This will guide you through the installation and configuration process and
suggest useful tools for development. If you instead prefer to setup manually,
keep reading.

Configuring the Client
----------------------

Initialize the client and configure it to use your `Sentry DSN`_:

.. code-block:: javascript

    const { init } = require('@sentry/electron');
    init({
      dsn: '___PUBLIC_DSN___',
      // more options...
    });

This configures the `Electron CrashReporter`_ for native app crashes and
captures any uncaught JavaScript exceptions using the JavaScript SDKs under the
hood. Be sure to call this function as early as possible in the main process and
all renderer processes to also catch errors during startup.

For more information on all configuration options, as well as the correct setup
in `Sandbox mode`_ or with disabled Node integration, see :doc:`config`.

Manually Reporting Errors
-------------------------

By default, the Electron SDK makes a best effort to capture any uncaught
exception and send crash reports from the Electron processes to Sentry.

To report errors manually, wrap potentially problematic code with a
``try...catch`` block and call `captureException`:

.. code-block:: javascript

    const { captureException } = require('@sentry/electron');
    try {
      myEvilOperation();
    } catch (e) {
      captureException(e);
    }

The SDK will automatically add useful information, such as the app name and
version or collect breadcrumbs for certain events. But there are more ways to
report errors and add custom metadata. For a complete guide on this see
:doc:`javascript`.

Uploading Debug Information
---------------------------

To get symbolicated stack traces for native crashes, you have to upload debug
symbols to Sentry. Sentry Wizard creates a convenient ``sentry-symbols.js``
script that will upload the Electron symbols for you. After installing the SDK
and every time you upgrade the Electron version, run this script:

.. code-block:: sh

    $ node sentry-symbols.js

If your app uses a custom Electron fork, contains modules with native
extensions or spawns subprocesses, you have to upload those symbols manually
using Sentry CLI. For more information, see :doc:`native`.

.. admonition:: Known Issue

    It is currently not possible to send events from native code (such as a C++
    extension). However, crashes will still be reported to Sentry if they happen
    in a process where the SDK has been configured. Also, crash reports from sub
    processes will not be reported automatically on all platforms. This feature
    will be added in a future SDK update.

Dealing with Minified Source Code
---------------------------------

The Electron SDK supports `Source Maps`_. If you upload source maps in addition
to your minified files that data becomes available in Sentry. For more
information see :doc:`sourcemaps`.

.. admonition:: Known Issue

    Sentry does not show source code context alongside stack traces in renderer
    crashes. This is a known issue and will be fixed in a future SDK update.

Deep Dive
---------

For more detailed information about how to get most out of the Electron SDK,
there is additional documentation available that covers all the rest:

.. toctree::
   :maxdepth: 1
   :titlesonly:

   config
   javascript
   native
   sourcemaps

.. _next generation JavaScript SDKs: https://github.com/getsentry/raven-js/tree/next#readme
.. _Sentry DSN: https://docs.sentry.io/hosted/quickstart/#configure-the-dsn
.. _Electron CrashReporter: https://github.com/electron/electron/blob/master/docs/api/crash-reporter.md
.. _Sandbox mode: https://github.com/electron/electron/blob/master/docs/api/sandbox-option.md
.. _Source Maps: http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/
