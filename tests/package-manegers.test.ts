import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll } from "vitest"

const execPromise = promisify(exec)

// cant change dirs because we are in a worker with vitest. prepend everything with this testDir path instead.
const testDir = 'tests/test-package'

describe('Testing if all package managers work', () => {
	beforeEach(async () => {
		// clean up node modules in current install.
		await execPromise(`rm -rf ./${testDir}/node_modules ./${testDir}/packages/package-to-isolate/isolate ./${testDir}/packages/package-to-isolate/node_modules ./${testDir}/package-lock.json ./${testDir}/yarn.lock ./${testDir}/pnpm-lock.yaml`)
	})
	
	afterAll(async () => {
		await execPromise(`rm -rf ./${testDir}/node_modules ./${testDir}/packages/package-to-isolate/isolate ./${testDir}/packages/package-to-isolate/node_modules ./${testDir}/package-lock.json ./${testDir}/yarn.lock ./${testDir}/pnpm-lock.yaml`)
	})

	it('Should isolate using npm', async () => {
		// install the test dir monorepo
		await execPromise(`cd ${testDir} && npm install`)		

		// run isolate command
		await execPromise(`cd ${testDir}/packages/package-to-isolate && npx isolate`)

		// check that the resulting isolate package can be installed with the selected package maneger
		await execPromise(`cd ${testDir}/packages/package-to-isolate/isolate && npm install`)
	})

	it('Should isolate using yarn', async () => {
		// install the test dir monorepo
		await execPromise(`cd ${testDir} && yarn install`)		

		// run isolate command
		await execPromise(`cd ${testDir}/packages/package-to-isolate && yarn isolate`)

		// check that the resulting isolate package can be installed with the selected package maneger
		await execPromise(`cd ${testDir}/packages/package-to-isolate/isolate && yarn install`)
	})
	
	it('Should isolate using pnpm', async () => {
		// install the test dir monorepo
		await execPromise(`cd ${testDir} && pnpm install`)		

		// run isolate command
		await execPromise(`cd ${testDir}/packages/package-to-isolate && pnpm isolate`)

		// check that the resulting isolate package can be installed with the selected package maneger
		await execPromise(`cd ${testDir}/packages/package-to-isolate/isolate && pnpm install`)
	})
}, 10000)