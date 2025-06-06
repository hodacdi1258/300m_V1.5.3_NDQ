import { appContext } from "../context.js";
import { Zalo } from "../index.js";
import { decryptResp, getSignKey, makeURL, ParamsEncryptor, request } from "../utils.js";

export async function login(encryptParams) {
    const encryptedParams = await getEncryptParam(appContext.imei, appContext.language, encryptParams, "getlogininfo");

    try {
        const response = await request(makeURL("https://wpa.chat.zalo.me/api/login/getLoginInfo", {
            ...encryptedParams.params,
            nretry: 0
        }));

        if (!response.ok) throw new Error("Failed to fetch login info: " + response.statusText);

        const data = await response.json();

        if (!data?.data) {
            return {
                success: false,
                error: "Phản hồi không chứa dữ liệu cần thiết.",
                raw: data
            };
        }

        if (encryptedParams.enk) {
            const decryptedData = decryptResp(encryptedParams.enk, data.data);

            if (!decryptedData || typeof decryptedData === "string") {
                console.error("Dữ liệu giải mã không hợp lệ:", decryptedData);
                return {
                    success: false,
                    error: "Dữ liệu giải mã không hợp lệ.",
                    raw: data
                };
            }

            return {
                success: true,
                data: decryptedData
            };
        }

        return {
            success: false,
            error: "Không có khóa mã hóa (enk).",
            raw: data
        };

    } catch (error) {
        console.error("Lỗi khi login:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

export async function getServerInfo(encryptParams) {
    const encryptedParams = await getEncryptParam(appContext.imei, appContext.language, encryptParams, "getserverinfo");

    try {
        const response = await request(makeURL("https://wpa.chat.zalo.me/api/login/getServerInfo", {
            imei: appContext.imei,
            type: Zalo.API_TYPE,
            client_version: Zalo.API_VERSION,
            computer_name: "Web",
            signkey: encryptedParams.params.signkey,
        }));

        if (!response.ok)
            throw new Error("Failed to fetch server info: " + response.statusText);

        const data = await response.json();

        if (!data?.data)
            throw new Error("Không nhận được dữ liệu server: " + data.error);

        return data.data;

    } catch (error) {
        console.error("Lỗi khi lấy server info:", error);
        throw new Error("Failed to fetch server info: " + error.message);
    }
}

async function getEncryptParam(imei, language, encryptParams, type) {
    const params = {};
    const data = {
        computer_name: "Web",
        imei,
        language,
        ts: Date.now(),
    };

    const encryptedData = await _encryptParam(data, encryptParams);

    if (encryptedData == null) {
        Object.assign(params, data);
    } else {
        const { encrypted_params, encrypted_data } = encryptedData;
        Object.assign(params, encrypted_params);
        params.params = encrypted_data;
    }

    params.type = Zalo.API_TYPE;
    params.client_version = Zalo.API_VERSION;
    params.signkey =
        type === "getserverinfo"
            ? getSignKey(type, {
                imei: appContext.imei,
                type: Zalo.API_TYPE,
                client_version: Zalo.API_VERSION,
                computer_name: "Web",
            })
            : getSignKey(type, params);

    return {
        params,
        enk: encryptedData ? encryptedData.enk : null,
    };
}

async function _encryptParam(data, encryptParams) {
    if (encryptParams) {
        const encryptor = new ParamsEncryptor({
            type: Zalo.API_TYPE,
            imei: data.imei,
            firstLaunchTime: Date.now(),
        });

        try {
            const stringifiedData = JSON.stringify(data);
            const encryptedKey = encryptor.getEncryptKey();
            const encodedData = ParamsEncryptor.encodeAES(encryptedKey, stringifiedData, "base64", false);
            const params = encryptor.getParams();

            return params
                ? {
                    encrypted_data: encodedData,
                    encrypted_params: params,
                    enk: encryptedKey,
                }
                : null;
        } catch (error) {
            throw new Error("Mã hóa thất bại: " + error.message);
        }
    }

    return null;
}
