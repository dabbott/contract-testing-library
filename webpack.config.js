const webpack = require("webpack");

module.exports = (env) => {
  return {
    target: "node",
    mode: env,
    entry: "./index.ts",
    output: {
      filename: "bundle.js",
      library: {
        name: "SolidityVM",
        type: "umd",
      },
    },
    devtool: "source-map",
    resolve: {
      extensions: [".ts", ".js"],
      fallback: {
        // crypto: require.resolve("crypto-browserify"),
        // path: require.resolve("path-browserify"),
        // stream: require.resolve("stream-browserify"),
        // buffer: require.resolve("buffer/"),
        // fs: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: ["ts-loader"],
        },
      ],
    },
    plugins: [
      // new webpack.ProvidePlugin({
      //   process: "process/browser",
      //   Buffer: ["buffer", "Buffer"],
      // }),
    ],
  };
};
