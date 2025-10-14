// next.config.ts
import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      konva: require.resolve("konva/lib/index.js"),
    };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^konva\/lib\/.*$/,
        require.resolve("konva/lib/index.js")
      )
    );

    if (isServer) {
      (config.resolve.alias as Record<string, any>)["react-konva"] = false;
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        canvas: false,
      };
    }
    return config;
  },
};

export default nextConfig;
