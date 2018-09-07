import { ApiResponse, ApisauceInstance, create } from "apisauce";
import { TaskTypes } from "./enum";
import { ICreateTaskResponse, IGetBalanceResponse, IGetTaskResultResponse } from "./interfaces";

export class AntiCaptcha {
    private api: ApisauceInstance;
    private debug: boolean;

    /**
     * Creates an instance of AntiCaptcha.
     *
     * @param {strig} clientKey - The client key provided in your admin panel.
     * @param {boolean} [debugMode=false] - Whether you want to get debug log in the console.
     * @memberof AntiCaptcha
     */
    constructor(clientKey: string, debugMode = false) {
        this.api = create({
            baseURL: "http://api.anti-captcha.com",
        });
        this.debug = debugMode;

        // Auto-fill client key on each request.
        this.api.addRequestTransform((request) => {
            if (!request.data) {
                request.data = { clientKey };
            } else {
                request.data.clientKey = clientKey;
            }
        });
    }

    /**
     * Get the account balance.
     *
     * @returns {Promise<ApiResponse<any>>}
     * @memberof AntiCaptcha
     */
    public async getBalance() {
        const response = await this.api.post("getBalance") as ApiResponse<IGetBalanceResponse>;
        if (response.ok && response.data.errorId === 0) {
            return response.data.balance;
        }

        throw new Error(response.data.errorDescription);
    }

    /**
     * Helper method to check whether the account balance is greater than the given amount.
     *
     * @param {number} amount - The amount to compare.
     *
     * @returns {Promise<boolean>}
     * @memberof AntiCaptcha
     */
    public async isBalanceGreaterThan(amount: number) {
        return await this.getBalance() > amount;
    }

    /**
     * Dispatch a task creation to the service. This will return a taskId.
     * Currently only Recaptcha proxyless is available.
     *
     * @param {string} websiteURL - The URL where the captcha is defined.
     * @param {string} websiteKey - The value of the "data-site-key" attribute.
     * @param {string} languagePool - The language pool. Default to English if not provided.
     *
     * @returns {Promise<number>}
     * @memberof AntiCaptcha
     */
    public async createTask(websiteURL: string, websiteKey: string, languagePool: string = "en") {
        const response = await this.api.post("createTask", {
            languagePool,
            task: {
                type: TaskTypes.RECAPTCHA_PROXYLESS,
                websiteKey,
                websiteURL,
            },
        }) as ApiResponse<ICreateTaskResponse>;

        if (response.ok && response.data.errorId === 0) {
            if (this.debug) { console.log(`Task [ ${response.data.taskId} ] - Created`); }
            return response.data.taskId;
        }

        throw new Error(response.data.errorDescription);
    }

    /**
     * Dispatch a task creation to the service. This will return a taskId.
     *
     * @param {string} body - File body encoded in base64. Make sure to send it without line breaks.
     * @param {boolean} phrase - If true, worker must enter an answer with at least one "space".
     * @param {boolean} caseSensitivie - If true, worker will see a special mark telling that answer must be entered with case sensitivity.
     * @param {number} numeric - 0 - no requirements, 1 - only number are allowed, 2 - any letters are allowed except numbers
     * @param {boolean} math - If true, worker will see a special mark telling that answer must be calculated.
     * @param {number} minLength - Defines minimum length of the answer. 0 = No requirements.
     * @param {number} maxLength - Defines maximum length of the answer. 0 = No requirements.
     * @param {string} comment - Additional comment for workers like "enter letters in red color". Result is not guaranteed.
     * @param {string} languagePool - The language pool. Default to English if not provided.
     *
     * @returns {Promise<number>}
     * @memberof AntiCaptcha
     */
    public async createImageToTextTask(body: string, phrase: boolean = false, caseSensitivie: boolean = false,
        numeric: number = 0, math: boolean = false,  minLength: number = 0, maxLength: number = 0, comment: string = "",
        languagePool: string = "en")
    {
        const response = await this.api.post("createTask", {
            languagePool,
            task: {
                type: TaskTypes.RECAPTCHA_PROXYLESS,
                body : body,
                phrase: phrase,
                case: caseSensitivie,
                numeric: numeric,
                math : math,
                minLength : minLength,
                maxLength : maxLength,
                comment: comment
            },
        }) as ApiResponse<ICreateTaskResponse>;

        if (response.ok && response.data.errorId === 0) {
            if (this.debug) { console.log(`Task [ ${response.data.taskId} ] - Created`); }
            return response.data.taskId;
        }

        throw new Error(response.data.errorDescription);
    }

    /**
     * Check a task to be resolved. Will try for given amount at the give time interval.
     *
     * @param {number} taskId - The task ID you want to check result.
     * @param {number} [retry=12] - The number of time the request must be tryed if worker is busy.
     * @param {number} [retryInterval=10000] - The amount of time before first and each try.
     *
     * @returns {Promise<IGetTaskResultResponse>}
     *
     * @see createTask
     * @memberof AntiCaptcha
     */
    public async getTaskResult(taskId: number, retry: number = 12, retryInterval = 10000) {
        let retryCount = 0;
        return new Promise((resolve, reject) => {
            const routine = setInterval(async () => {
                if (this.debug) { console.log(`Task [ ${taskId} ] - Retry : ${retryCount}`); }
                if (retryCount > retry) {
                    if (this.debug) { console.log(`Task [${taskId}] - Exceeded retry count [ ${retry} ].`); }
                    clearInterval(routine);
                    reject(new Error("L'appel est timeout."));
                    return;
                }

                const response = await this.api
                    .post("getTaskResult", { taskId }) as ApiResponse<IGetTaskResultResponse>;

                retryCount++; // We update the timeout count

                // If Error we reject
                if (!response.ok || response.data.errorId !== 0) {
                    clearInterval(routine);
                    reject(new Error(response.data.errorDescription));
                    return;
                }

                // If request is OK, we resolve
                if (response.data.status === "ready") {
                    if (this.debug) { console.log(`Task [ ${taskId} ] - Hash found !`); }
                    clearInterval(routine);
                    resolve(response.data);
                    return;
                }
            }, retryInterval);
        }) as Promise<IGetTaskResultResponse>;
    }
}
