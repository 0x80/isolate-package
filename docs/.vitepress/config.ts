import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Isolate Package",
  description:
    "Isolate monorepo packages to form a self-contained deployable unit",
  base: "/",
  cleanUrls: true,

  themeConfig: {
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Configuration", link: "/configuration" },
          { text: "CLI Reference", link: "/cli-reference" },
          { text: "API", link: "/api" },
        ],
      },
      {
        text: "Topics",
        items: [
          {
            text: "Deploying to Firebase",
            link: "/deploying-to-firebase",
          },
          { text: "Internal Packages", link: "/internal-packages" },
          {
            text: "Patched Dependencies",
            link: "/patched-dependencies",
          },
          {
            text: "Comparison with pnpm deploy",
            link: "/comparison",
          },
          { text: "Troubleshooting", link: "/troubleshooting" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/0x80/isolate-package" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright &copy; Thijs Koerselman",
    },
  },
});
