import { Page } from 'playwright'
import readline from 'readline'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})


export class Login {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async login(page: Page, email: string, password: string) {

        try {
            // Navigate to the Bing login page
            await page.goto('https://rewards.bing.com/signin')

            const isLoggedIn = await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10_000 }).then(() => true).catch(() => false)

            if (!isLoggedIn) {
                // Check if account is locked
                const isLocked = await page.waitForSelector('.serviceAbusePageContainer', { state: 'visible', timeout: 1000 }).then(() => true).catch(() => false)
                if (isLocked) {
                    this.bot.log('LOGIN', 'This account has been locked!', 'error')
                    throw new Error('Account has been locked!')
                }

                await this.execLogin(page, email, password)
                this.bot.log('LOGIN', 'Logged into Microsoft successfully')
            } else {
                this.bot.log('LOGIN', 'Already logged in')
            }

            // Check if logged in to bing
            await this.checkBingLogin(page)

            // Save session
            await saveSessionData(this.bot.config.sessionPath, page.context(), email, this.bot.isMobile)

            // We're done logging in
            this.bot.log('LOGIN', 'Logged in successfully')

        } catch (error) {
            // Throw and don't continue
            throw this.bot.log('LOGIN', 'An error occurred:' + error, 'error')
        }
    }

    private async execLogin(page: Page, email: string, password: string) {
        try {
            // Enter email
            await page.fill('#i0116', email)
            await page.click('#idSIButton9')

            this.bot.log('LOGIN', 'Email entered successfully')

            try {
                // Enter password
                await page.waitForSelector('#i0118', { state: 'visible', timeout: 2000 })
                await this.bot.utils.wait(2000)

                await page.fill('#i0118', password)
                await page.click('#idSIButton9')

                // When erroring at this stage it means a 2FA code is required
            } catch (error) {
                const hasSendPushNotification
                    = await page.waitForSelector('#pushNotificationsTitle', { state: 'visible', timeout: 2000 })
                        .then(() => true).catch(() => false)

                if (hasSendPushNotification) {
                    const numberElement = (await page.waitForSelector('span#displaySign',  { state: 'visible', timeout: 2000 }));
                    const number = await numberElement.innerText();
                    
                    this.bot.log('LOGIN', '2FA code for "'+email+'": ' + number);

                    await await page.waitForSelector('span#displaySign',  { state: 'hidden', timeout: 30000 })
                } else {
                    this.bot.log('LOGIN', '2FA code required')

                    // Wait for user input
                    const code = await new Promise<string>((resolve) => {
                        rl.question('Enter 2FA code:\n', (input) => {
                            rl.close()
                            resolve(input)
                        })
                    })

                    await page.fill('input[name="otc"]', code)
                    await page.keyboard.press('Enter')
                }
            }

            this.bot.log('LOGIN', 'Password entered successfully')

        } catch (error) {
            this.bot.log('LOGIN', 'An error occurred:' + error, 'error')
        }

        const currentURL = new URL(page.url())

        while (currentURL.pathname !== '/' || currentURL.hostname !== 'rewards.bing.com') {
            await this.bot.browser.utils.tryDismissAllMessages(page)
            currentURL.href = page.url()
        }

        // Wait for login to complete
        await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10_000 })
    }

    private async checkBingLogin(page: Page): Promise<void> {
        try {
            this.bot.log('LOGIN-BING', 'Verifying Bing login')
            await page.goto('https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F')

            const maxIterations = 5

            for (let iteration = 1; iteration <= maxIterations; iteration++) {
                const currentUrl = new URL(page.url())

                if (currentUrl.hostname === 'www.bing.com' && currentUrl.pathname === '/') {
                    await this.bot.browser.utils.tryDismissBingCookieBanner(page)

                    const loggedIn = await this.checkBingLoginStatus(page)
                    // If mobile browser, skip this step
                    if (loggedIn || this.bot.isMobile) {
                        this.bot.log('LOGIN-BING', 'Bing login verification passed!')
                        break
                    }
                }

                await this.bot.utils.wait(1000)
            }

        } catch (error) {
            this.bot.log('LOGIN-BING', 'An error occurred:' + error, 'error')
        }
    }

    private async checkBingLoginStatus(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#id_n', { timeout: 5000 })
            return true
        } catch (error) {
            return false
        }
    }

}