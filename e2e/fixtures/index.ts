import { test as base, Browser, Page } from '@playwright/test'
import { resetDb } from './db'
import { getAdminToken } from '../helpers/auth'
import { createSession } from '../helpers/session'

export type Fixtures = {
  adminToken: string
  sessionCode: string
}

export const test = base.extend<Fixtures>({
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
