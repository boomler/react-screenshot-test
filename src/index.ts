import getPort from "get-port";
import { createScreehotClient } from "./screenshot-client";
import {
  createSSRComponentServer,
  createWebpackComponentServer,
  createViteComponentServer,
} from "./components-server";
import { PageCreateBody, PageGotoBody, PageScreenshotBody } from "./interface";
import { logger } from "./logger";
import { serverType } from "./const";

export { recordCss } from "./recorded-css";

function getHostname() {
  if (serverType === 'local') {
    return 'http://localhost'
  }
  return `http://${
    process.platform !== "linux" ? "host.docker.internal" : "localhost"
  }`;
}

class Render<T> {
  constructor(
    public readonly createServer: (
      port: number,
      props: T
    ) => Promise<() => Promise<void>>
  ) {}

  async render(props: T) {
    const port = await getPort();
    const cleanupServer = await this.createServer(port, props);
    const client = createScreehotClient({ port: 3001 });
    const host = getHostname();
    return {
      createPage: async ({
        path = "",
        browser = "chromium",
        viewport,
        deviceScaleFactor,
      }: Partial<Omit<PageCreateBody, "url">> & { path?: string } = {}) => {
        logger.time("client.createPage");
        const {
          data: { id },
        } = await client.createPage({
          url: `${host}:${port}#/${path.replace(/^\//, "")}`,
          browser,
          viewport,
          deviceScaleFactor,
        });
        logger.timeEnd("client.createPage");
        return {
          screenshot: async (payload: PageScreenshotBody = {}) => {
            logger.time("client.screenshot");
            const res = Buffer.from(
              (await client.screenshot(id, payload)).data
            );
            logger.timeEnd("client.screenshot");
            return res;
          },
          goto: async (payload: { path: string }) => {
            logger.time(`client.goto ${payload.path}`);
            await client.goto(id, {
              url: `${host}:${port}#/${payload.path.replace(/^\//, "")}`,
            });
            logger.timeEnd(`client.goto ${payload.path}`);
          },
          close: async () => client.closePage(id),
        };
      },
      cleanup: async () => {
        logger.time("cleanup");
        await cleanupServer();
        logger.timeEnd("cleanup");
      },
    };
  }
}

export const webpackRender = new Render(createWebpackComponentServer);
export const ssrRender = new Render(createSSRComponentServer);
export const viteRender = new Render(createViteComponentServer);
