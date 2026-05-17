import { test as base } from '@playwright/test'
import { resetDb } from './db'
import { getAdminToken, clearTokenCache } from '../helpers/auth'
import { createSession } from '../helpers/session'

export type Fixtures = {
  adminToken: string
  sessionCode: string
}

export const test = base.extend<Fixtures & { _reset: void }>({
  _reset: [async ({}, use) => {
    clearTokenCache()
    await resetDb()
    await use()
  }, { auto: true }],

  adminToken: async ({}, use) => {
    const token = await getAdminToken()
    await use(token)
  },
  sessionCode: async ({ adminToken }, use) => {
    const code = await createSession(adminToken)
    await use(code)
  },
})

export { expect } from '@playwright/test'
