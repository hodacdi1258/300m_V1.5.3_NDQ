import { getOwnId } from "./apis/getOwnId.js";
import { Listener } from "./apis/listen.js";
import { getServerInfo, login } from "./apis/login.js";
import { appContext } from "./context.js";
import { logger, makeURL } from "./utils.js";
import * as factories from "./apis/index.js";
import { checkUpdate } from "./update.js";
import { setBotId } from "../index.js";

class Zalo {
  constructor(credentials, options = {}) {
    this.enableEncryptParam = true;
    this.validateParams(credentials);

    appContext.imei = credentials.imei;
    appContext.cookie = this.parseCookies(credentials.cookie);
    appContext.userAgent = credentials.userAgent;
    appContext.language = credentials.language || "vi";
    appContext.timeMessage = credentials.timeMessage || 0;
    appContext.secretKey = null;

    Object.assign(appContext.options, options);
  }

  parseCookies(cookie) {
    if (typeof cookie === "string") {
      const trimmed = cookie.trim();
      if (!trimmed) throw new Error("Cookie chuỗi rỗng không hợp lệ");
      return trimmed;
    }

    if (typeof cookie === "object") {
      const cookiesArray = cookie.cookies || cookie;
      if (Array.isArray(cookiesArray) && cookiesArray.length > 0) {
        return cookiesArray.map(c => {
          if (!c.name || !c.value) throw new Error("Cookie item thiếu name hoặc value");
          return `${c.name}=${c.value}`;
        }).join("; ");
      }
    }

    throw new Error("Cookie không hợp lệ: cần chuỗi hoặc object cookies");
  }

  validateParams(credentials) {
    if (!credentials) throw new Error("Thiếu credentials");
    if (!credentials.imei) throw new Error("Thiếu param: imei");
    if (!credentials.cookie) throw new Error("Thiếu param: cookie");
    if (!credentials.userAgent) throw new Error("Thiếu param: userAgent");
  }

  async login() {
    await checkUpdate();

    const loginData = await login(this.enableEncryptParam);
    if (!loginData) throw new Error("Không nhận được dữ liệu đăng nhập từ Zalo");

    const serverInfo = await getServerInfo(this.enableEncryptParam);
    if (!serverInfo) throw new Error("Không thể lấy thông tin server từ Zalo");

    appContext.secretKey = loginData.data.zpw_enk;
    appContext.uid = loginData.data.uid;
    setBotId(loginData.data.uid);
    appContext.settings = serverInfo.settings || serverInfo.setttings;

    logger.info("Logged in as", loginData.data.uid);

    return new API(
      appContext.secretKey,
      loginData.data.zpw_service_map_v3,
      makeURL(`${loginData.data.zpw_ws[0]}`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
        t: Date.now()
      })
    );
  }
}

Zalo.API_TYPE = 30;
Zalo.API_VERSION = 649;

class API {
  constructor(secretKey, zpwServiceMap, wsUrl) {
    this.secretKey = secretKey;
    this.zpwServiceMap = zpwServiceMap;
    this.listener = new Listener(wsUrl);
    this.getOwnId = getOwnId;

    for (const [name, factory] of Object.entries(factories)) {
      if (typeof factory === 'function') {
        this[name] = factory(this);
      } else {
        this[name] = factory;
      }
    }
  }
}

export { Zalo, API };
