JavaScript Usage
================

Using Sentry from JavaScript code works exactly the same as in any other
JavaScript environment. However, the Electron SDK conveniently configures the
right SDK when you initialize it:

* In the main process, it uses the *Node SDK*.
* In renderers, it uses the *Browser SDK*.

.. tip::

    There is no need to include ``@sentry/node`` or ``@sentry/browser`` in
    addition to the Electron SDK. It includes all their features and even
    configures them with sane defaults. If you prefer to override some of
    their settings, you can specify them in addition to the options listed in
    :doc:`config` when calling ``init()``.

In this document, we assume that the entire SDK is imported into a ``Sentry``
variable and in scope. Depending on your language level, you might need
different syntax for this:

.. code-block:: javascript

    // Node
    const Sentry = require('@sentry/electron');

    // ES2015+
    import * as Sentry from '@sentry/electron';

    // TypeScript
    import * as Sentry from '@sentry/electron';


Reporting Correctly
-------------------

By default, the Electron SDK tries to capture meaningful stack traces, but the
concurrent Electron's processes make this difficult. The easiest solution is to
prevent errors from bubbling all the way up the stack.

Depending on the circumstances, there are different methods to report errors:

try … catch
```````````

The simplest way, is to try and explicitly capture and report potentially
problematic code with a ``try...catch`` block and ``captureException``.

.. code-block:: javascript

    try {
        doSomething(a[0]);
    } catch(e) {
        captureException(e);
    }

.. admonition:: Do not throw strings!

    Always throw an actual ``Error`` object. It's impossible to retrieve a stack
    trace from a string. If this happens, the SDK transmits the error as a plain
    message. For example:

    .. code-block:: javascript

        throw new Error('broken');  // good
        throw 'broken';  // bad

Custom Messages
```````````````

If you wish to send a non-error event instead, use ``captureMessage``. This will
show up with a different level in Sentry:

.. code-block:: javascript

    Sentry.captureMessage('My custom event');

Tracking Users
--------------

While a user is logged in, you can tell Sentry to associate errors with
user data:

.. code-block:: javascript

    Sentry.configureScope(scope => {
        scope.setUser({
            id: '42',
            email: 'user@example.org'
        });
    });

This data is generally submitted with each error or message and allows you to
figure out which users are affected by problems. If at any point the user
becomes unauthenticated, call ``scope.setUser({})`` with an empty object to
remove their data.

Tagging Events
--------------

Sentry allows to filter and search for issues by tags. You can set global tags
to be merged in with future exceptions or messages via ``scope.setTag``:

.. code-block:: javascript

    Sentry.configureScope(scope => {
        scope.setTag('key', 'value');
    });

Tags given in ``scope.setTag`` are merged with existing tags. If you need to
remove a tag, then set it explicitly to ``null`` or ``undefined``.

Passing Additional Data
-----------------------

In addition to user context and tags, you can pass arbitrary to associate with
future events. Note that the objects you pass in must be JSON-serializable:

.. code-block:: javascript

    Sentry.configureScope(scope => {
        scope.setExtra('my', {data: 2});
    });

Data given in ``scope.setExtra`` is shallow-merged with existing extras. To
remove a top-level key from extras, explicitly set it to ``null`` or
``undefined``.

Recording Breadcrumbs
---------------------

Breadcrumbs are browser and application lifecycle events that are helpful in
understanding the state of the application leading up to a crash.

In renderers, the SDK instruments browser built-ins and DOM events to
automatically collect a few useful breadcrumbs for you:

* fetch and XMLHttpRequests
* URL / address bar changes
* UI clicks and keypress DOM events
* console log statements
* previous errors

In the main process, the SDK also automatically captures breadcrumbs for:

* HTTP/HTTPS requests
* console log statements

You can also record your own breadcrumbs:

.. code-block:: javascript

   Sentry.addBreadcrumb({
     message: 'Item added to shopping cart',
     category: 'action',
     data: {
        isbn: '978-1617290541',
        cartSize: '3'
     }
   });

For more on configuring breadcrumbs, see :doc:`config`. To learn more about what
types of data can be collected via breadcrumbs, see the `breadcrumbs client API
specification`_.

Receiving Source Context
------------------------

The Electron SDK supports `Source Maps`_. If you upload source maps in addition
to your minified files that data becomes available in Sentry. This applies to
the main process as well as renderer processes. For more information see
:doc:`sourcemaps`.

.. note::

    Without uploading sourcemaps or source code to Sentry, you might not see
    source context in issues at all. In the main process, the SDK will try to
    read source files from the app, but this process will not work in renderers
    necessarily.

.. _breadcrumbs client API specification: https://docs.sentry.io/learn/breadcrumbs/
.. _Source Maps: http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/

Uncaught Exceptions
-------------------

The default behavior for dealing with globally unhandled exceptions and Promise
rejections differs by process.

In the main process, such unhandled errors Sentry will capture before showing the
default dialog electron always shows. To override this behavior, declare a
custom ``onFatalError`` callback when configuring the SDK, for example if you
want your app to exit do:

.. code-block:: javascript

    Sentry.init({
      dsn: '___PUBLIC_DSN___',
      onFatalError: function (err) {
        if (!sendErr) {
          console.log('Successfully sent fatal error to Sentry:');
          console.error(err.stack);
        }

        console.log('This is thy sheath; there rust, and let me die.');
        process.exit(1);
      }
    });

Renderer processes do not crash on unhandled errors and there is no
``onFatalError`` configuration option. Instead, the SDK automatically captures
them and sends them to Sentry. This also applies to Promises and polyfills that
report a global ``unhandledrejection`` DOM event.
