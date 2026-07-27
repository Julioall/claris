import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MOODLE_SYNC_SYNTHETIC_BENCHMARK_VERSION,
  runSyntheticMoodleSyncScenario,
  verifySyntheticMoodleSyncScenario,
} from './lib/moodle-sync-synthetic-benchmark.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = path.join(root, 'docs', 'benchmarks', 'moodle-sync-synthetic-contract.json')

function readContract() {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
  if (
    contract.schemaVersion !== 1
    || contract.benchmarkVersion !== MOODLE_SYNC_SYNTHETIC_BENCHMARK_VERSION
    || !Array.isArray(contract.scenarios)
  ) {
    throw new Error('Contrato do benchmark Moodle sintetico invalido.')
  }
  return contract
}

function selectedScenarios(contract) {
  const argumentIndex = process.argv.indexOf('--scenario')
  if (argumentIndex < 0) return contract.scenarios
  const id = process.argv[argumentIndex + 1]
  const selected = contract.scenarios.filter((scenario) => scenario.id === id)
  if (selected.length !== 1) throw new Error(`Cenario Moodle desconhecido: ${id ?? '(ausente)'}.`)
  return selected
}

function main() {
  const contract = readContract()
  const results = selectedScenarios(contract).map((scenario) => {
    const result = runSyntheticMoodleSyncScenario(scenario.studentCount)
    verifySyntheticMoodleSyncScenario(result, scenario)
    return { id: scenario.id, ...result }
  })

  console.log(JSON.stringify({
    benchmark: contract.benchmark,
    benchmarkVersion: MOODLE_SYNC_SYNTHETIC_BENCHMARK_VERSION,
    contractPath: path.relative(root, contractPath).replaceAll('\\', '/'),
    execution: 'local-synthetic-no-network',
    results,
  }, null, 2))
}

try {
  main()
} catch (error) {
  console.error(`[benchmark-moodle-sync] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
