import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll } from "vitest"

const execPromise = promisify(exec)

// cant change dirs because we are in a worker with vitest. prepend everything with this testDir path instead.
const testDir = 'tests/test-package'

const cleanup = async () => {
	// clean up node modules in current install.

	// recursively delete all node_modules
	await execPromise(`find ./${testDir} -type d -name "node_modules" -exec rm -rf {} +`)

	// delete the isolate folder
	await execPromise(`rm -rf ./${testDir}/packages/package-to-isolate/isolate`)

	// delete lock files
	await execPromise(`rm -f ./${testDir}/package-lock.json ./${testDir}/yarn.lock ./${testDir}/pnpm-lock.yaml`)
}

describe('Testing if all package managers work', () => {
	beforeEach(async () => {
		await cleanup()
	})
	
	afterAll(async () => {
		await cleanup()
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