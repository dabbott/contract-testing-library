const webpack = require("webpack");

module.exports = () => {
  return {
    entry: "./index.ts",
    output: {
      filename: "index.js",
      library: {
        name: "SolidityVM",
        type: "umd",
      },
    },
    devtool: "source-map",
    resolve: {
      extensions: [".ts", ".js"],
      fallback: {
        crypto: require.resolve("crypto-browserify"),
        path: require.resolve("path-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        fs: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: [
            {
              loader: "ts-loader",
              options: {
                compilerOptions: {
                  declaration: true,
                  declarationDir: "./dist",
                },
              },
            },
          ],
        },
      ],
    },
    plugins: [
      new webpack.ProvidePlugin({
        process: require.resolve("./platform.js"),
        Buffer: ["buffer", "Buffer"],
      }),
    ],
  };
};
