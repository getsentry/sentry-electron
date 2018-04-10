Source Maps
===========

Sentry supports un-minifying JavaScript via Source Maps. This lets you view
source code context obtained from stack traces in their original form, which is
particularly useful for debugging minified code (e.g. UglifyJS), or transpiled
code from a higher-level language (e.g. TypeScript).

Even when using plain JavaScript, you must upload your source files to allow
Sentry to display source context for stack traces from renderer processes. This
is caused by restrictions of `sandboxing`_ or disabling Node integration.

Specifying the Release
----------------------

To upload source map artifacts to Sentry, you have to specify the ``release`` in
the SDK configuration and during the upload. Releases are global within your
organization and might incorporate multiple of your projects. To isolate it,
prefix the release version with an App id. Sentry will use this release name to
associate digested event data with the files you've uploaded.

.. code-block:: javascript

    Sentry.init({
      dsn: '___PUBLIC_DSN___',
      release: 'myapp-1.2.3'
    });

Generating Source Maps
----------------------

Most modern JavaScript transpilers support source maps. Below are instructions
for common tools.

To allow Sentry to match source code references to uploaded source maps or
source files, make sure your tool outputs files relative to your project root
folder and prefixes them either with ``/`` or with ``~/``. Some tools do this
automatically (e.g. Webpack), or have a configuration option (e.g. TypeScript).
For others, please see the section on rewriting source maps before uploading.

The SDK will rewrite stack traces before sending them to Sentry. If your
application generates manual stack traces for some reason, make sure stack
frames always contain relative paths from the project root starting with ``~/``
or ``app:///``.

UglifyJS
~~~~~~~~

UglifyJS is a popular tool for minifying your source code for production. It can
dramatically reduce the size of your files by eliminating whitespace, rewriting
variable names, removing dead code branches, and more.

If you are using UglifyJS to minify your source code, the following command will
additionally generate a source map that maps the minified code back to the
original source:

.. code-block:: sh

    $ uglifyjs app.js \
      -o app.min.js.map \
      --source-map url=app.min.js.map,includeSources

Webpack
~~~~~~~

Webpack is a powerful build tool that resolves and bundles your JavaScript
modules into files fit for running in the browser. It also supports various
*loaders* to transpile higher-level languages, reference stylesheets, or
include static assets.

We have created a convenient `webpack plugin`_ that configures source maps and
uploads them to Sentry during the build. This is the recommended way for
uploading sources to Sentry. First, install the plugin via:

.. code-block:: sh

    $ npm install --save-dev @sentry/webpack-plugin
    $ yarn add --dev @sentry/webpack-plugin

To allow the plugin to upload source maps automatically, create a
``.sentryclirc`` or configure environment variables as described in the `CLI
configuration docs`_. Then, add the plugin to your ``webpack.config.js``:

.. code-block:: javascript

    const SentryWebpackPlugin = require('@sentry/webpack-plugin');

    module.exports = {
      // other configuration
      plugins: [
        new SentryWebpackPlugin({
          include: '.',
          ignoreFile: '.sentrycliignore',
          ignore: ['node_modules', 'webpack.config.js'],
          configFile: 'sentry.properties'
        })
      ]
    };

Alternatively, if you prefer to upload source maps manually, Webpack just needs
to be configured to output source maps:

.. code-block:: javascript

    module.exports = {
        output: {
          path: path.join(__dirname, 'dist'),
          filename: "[name].js",
          sourceMapFilename: "[name].js.map"
        }
        // other configuration
    };

.. note::

    In case you use `SourceMapDevToolPlugin`_ for more fine grained control of
    source map generation, leave ``noSources`` turned off, so Sentry can display
    proper source code context in event stack traces.

TypeScript
~~~~~~~~~~

The TypeScript compiler can output source maps. Configure the ``sourceRoot``
property to ``/`` to strip the build path prefix from generated source code
references. This allows Sentry to match source files relative to your source
root folder:

.. code-block:: json

    {
        "compilerOptions": {
            "sourceMap": true,
            "inlineSources": true,
            "sourceRoot": "/"
        }
    }

Uploading Source Maps to Sentry
-------------------------------

Except for webpack, the recommended way to upload source maps is using
`Sentry CLI`_. If you have used *Sentry Wizard* to set up your project, it has
already created all necessary configuration to upload source maps. Otherwise,
follow the `CLI configuration docs`_ to set up your project.

Sentry uses **Releases** to match the correct source maps to your events. To
create a new release, run the following command (e.g. during publishing):

.. code-block:: sh

    $ sentry-cli releases new <release_name>

Note the release name must be **unique within your organization** and match the
``release`` option in your SDK initialization code. Then, use the
``upload-sourcemaps`` command to scan a folder for source maps, process them and
upload them to Sentry:

.. code-block:: sh

    $ sentry-cli releases files <release_name> upload-sourcemaps /path/to/files

This command will upload all files ending in *.js* and *.map* to the specified
release. If you wish to change these extensions -- e.g. to upload typescript
sources -- use the ``--ext`` option:

.. code-block:: sh

    $ sentry-cli releases files <release_name> upload-sourcemaps --ext ts,map /path/to/files

.. admonition:: Validating Sourcemaps with Sentry CLI

    Unfortunately, it can be quite challenging to ensure that source maps are
    actually valid and uploaded correctly. To ensure that everything is working
    as intended, you can add the ``--validate`` flag when uploading source maps.
    It attempts to parse the source maps and verify source references locally.
    Note that this flag might produce false positives if you have references to
    external source maps.

Until now, the release is in a draft state ("*unreleased*"). Once all source
maps have been uploaded and your app has been published successfully, finalize
the release with the following command:

.. code-block:: sh

    $ sentry-cli releases finalize <release_name>

For convenience, you can alternatively pass the ``--finalize`` flag to the
``new`` command which will immediately finalize the release.

.. _sandboxing: https://github.com/electron/electron/blob/master/docs/api/sandbox-option.md
.. _releases API: https://docs.sentry.io/api/releases/
.. _Sentry CLI: https://docs.sentry.io/learn/cli/
.. _Webpack plugin: https://github.com/getsentry/sentry-webpack-plugin
.. _CLI configuration docs: https://docs.sentry.io/learn/cli/configuration/
.. _SourceMapDevToolPlugin: https://webpack.js.org/plugins/source-map-dev-tool-plugin
