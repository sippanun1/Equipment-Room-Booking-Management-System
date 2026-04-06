/**
 * Test Scenarios for Two-Collection Equipment Architecture
 * 
 * This file contains test data and functions to validate the new equipment structure.
 * Use these to test the system before going to production.
 * 
 * HOW TO USE:
 * 1. Import these in AdminManageEquipment or create a test admin page
 * 2. Call the test functions directly
 * 3. Verify results in Firestore and UI
 * 4. Delete test data when done using cleanup functions
 */

import { addNewAsset, addAssetStock, loadAllEquipment, addNewConsumable, addConsumableStock, deleteEquipment } from './equipmentHelper'

// Test data fixtures
export const testAssets = {
  welding: {
    nameThai: 'เครื่องเชื่อม',
    nameEnglish: 'Welding Machine',
    serialCodes: ['WM-001', 'WM-002', 'WM-003'],
    unit: 'เครื่อง',
    types: ['Welding'],
    subTypes: ['SMAW', 'GMAW']
  },
  lathe: {
    nameThai: 'เครื่องกลึง',
    nameEnglish: 'Lathe Machine',
    serialCodes: ['LM-001', 'LM-002'],
    unit: 'เครื่อง',
    types: ['Machine'],
    subTypes: ['Lathe']
  },
  drill: {
    nameThai: 'สว่านไฟฟ้า',
    nameEnglish: 'Electric Drill',
    serialCodes: ['ED-001', 'ED-002', 'ED-003', 'ED-004'],
    unit: 'ชิ้น',
    types: ['Safety'],
    subTypes: []
  }
}

export const testConsumables = {
  electrode: {
    nameThai: 'ลวดเชื่อม',
    nameEnglish: 'Welding Electrode',
    quantity: 50,
    unit: 'ม้วน',
    types: ['Welding'],
    subTypes: ['SMAW']
  },
  oil: {
    nameThai: 'น้ำมันเครื่อง',
    nameEnglish: 'Machine Oil',
    quantity: 10,
    unit: 'ลิตร',
    types: ['Safety'],
    subTypes: []
  }
}

/**
 * TEST 1: Create new assets with multiple serial codes
 * Expected: 3 new assets created, each with multiple instances
 */
export async function testCreateAssets(): Promise<{
  success: boolean
  createdIds: string[]
  errors: string[]
}> {
  const result = {
    success: false,
    createdIds: [] as string[],
    errors: [] as string[]
  }

  try {
    console.log('🧪 TEST 1: Creating new assets with multiple serial codes...')

    const weldingId = await addNewAsset(
      testAssets.welding.nameThai,
      testAssets.welding.nameEnglish,
      testAssets.welding.serialCodes,
      testAssets.welding.unit,
      testAssets.welding.types,
      testAssets.welding.subTypes
    )

    if (!weldingId) {
      result.errors.push('Failed to create welding machine')
    } else {
      result.createdIds.push(weldingId)
      console.log(`✓ Welding machine created: ${weldingId}`)
    }

    const latheId = await addNewAsset(
      testAssets.lathe.nameThai,
      testAssets.lathe.nameEnglish,
      testAssets.lathe.serialCodes,
      testAssets.lathe.unit,
      testAssets.lathe.types,
      testAssets.lathe.subTypes
    )

    if (!latheId) {
      result.errors.push('Failed to create lathe machine')
    } else {
      result.createdIds.push(latheId)
      console.log(`✓ Lathe machine created: ${latheId}`)
    }

    const drillId = await addNewAsset(
      testAssets.drill.nameThai,
      testAssets.drill.nameEnglish,
      testAssets.drill.serialCodes,
      testAssets.drill.unit,
      testAssets.drill.types,
      testAssets.drill.subTypes
    )

    if (!drillId) {
      result.errors.push('Failed to create drill')
    } else {
      result.createdIds.push(drillId)
      console.log(`✓ Drill created: ${drillId}`)
    }

    result.success = result.createdIds.length === 3
    console.log(`✅ TEST 1 Result: ${result.createdIds.length}/3 assets created`)
    return result
  } catch (error) {
    result.errors.push(`TEST 1 Error: ${error instanceof Error ? error.message : String(error)}`)
    console.error('❌ TEST 1 Failed:', result.errors)
    return result
  }
}

/**
 * TEST 2: Create consumables
 * Expected: 2 new consumables created
 */
export async function testCreateConsumables(): Promise<{
  success: boolean
  createdIds: string[]
  errors: string[]
}> {
  const result = {
    success: false,
    createdIds: [] as string[],
    errors: [] as string[]
  }

  try {
    console.log('🧪 TEST 2: Creating consumables...')

    const electrodeId = await addNewConsumable(
      testConsumables.electrode.nameThai,
      testConsumables.electrode.nameEnglish,
      testConsumables.electrode.quantity,
      testConsumables.electrode.unit,
      testConsumables.electrode.types,
      testConsumables.electrode.subTypes
    )

    if (!electrodeId) {
      result.errors.push('Failed to create electrode')
    } else {
      result.createdIds.push(electrodeId)
      console.log(`✓ Electrode created: ${electrodeId}`)
    }

    const oilId = await addNewConsumable(
      testConsumables.oil.nameThai,
      testConsumables.oil.nameEnglish,
      testConsumables.oil.quantity,
      testConsumables.oil.unit,
      testConsumables.oil.types,
      testConsumables.oil.subTypes
    )

    if (!oilId) {
      result.errors.push('Failed to create oil')
    } else {
      result.createdIds.push(oilId)
      console.log(`✓ Oil created: ${oilId}`)
    }

    result.success = result.createdIds.length === 2
    console.log(`✅ TEST 2 Result: ${result.createdIds.length}/2 consumables created`)
    return result
  } catch (error) {
    result.errors.push(`TEST 2 Error: ${error instanceof Error ? error.message : String(error)}`)
    console.error('❌ TEST 2 Failed:', result.errors)
    return result
  }
}

/**
 * TEST 3: Load and verify equipment structure
 * Expected: All created equipment appears in loadAllEquipment with correct grouping
 */
export async function testLoadEquipment(): Promise<{
  success: boolean
  totalEquipment: number
  assetCount: number
  consumableCount: number
  totalInstances: number
  errors: string[]
}> {
  const result = {
    success: false,
    totalEquipment: 0,
    assetCount: 0,
    consumableCount: 0,
    totalInstances: 0,
    errors: [] as string[]
  }

  try {
    console.log('🧪 TEST 3: Loading and verifying equipment structure...')

    const equipmentResult = await loadAllEquipment()
    const equipment = equipmentResult.items
    result.totalEquipment = equipment.length

    for (const item of equipment) {
      if (item.sourceCollection === 'equipmentMaster') {
        result.assetCount++
        result.totalInstances += item.allIds?.length || 0
      } else {
        result.consumableCount++
      }
    }

    // Verify test data appears
    const hasWelder = equipment.some(e => e.name.includes('เชื่อม'))
    const hasLathe = equipment.some(e => e.name.includes('กลึง'))
    const hasDrill = equipment.some(e => e.name.includes('สว่าน'))
    const hasElectrode = equipment.some(e => e.name.includes('ลวดเชื่อม'))
    const hasOil = equipment.some(e => e.name.includes('น้ำมันเครื่อง'))

    if (!hasWelder) result.errors.push('Welding machine not found')
    if (!hasLathe) result.errors.push('Lathe machine not found')
    if (!hasDrill) result.errors.push('Drill not found')
    if (!hasElectrode) result.errors.push('Electrode not found')
    if (!hasOil) result.errors.push('Oil not found')

    result.success = result.errors.length === 0 && result.assetCount >= 3

    console.log(`✅ TEST 3 Result:
      Total equipment: ${result.totalEquipment}
      Assets: ${result.assetCount}
      Consumables: ${result.consumableCount}
      Total instances: ${result.totalInstances}`)

    if (result.errors.length > 0) {
      console.log('⚠️ Errors:', result.errors)
    }

    return result
  } catch (error) {
    result.errors.push(`TEST 3 Error: ${error instanceof Error ? error.message : String(error)}`)
    console.error('❌ TEST 3 Failed:', result.errors)
    return result
  }
}

/**
 * TEST 4: Add stock to existing asset
 * Expected: New instances created for existing asset
 */
export async function testAddAssetStock(assetName: string = testAssets.welding.nameThai + ' (Welding Machine)'): Promise<{
  success: boolean
  instancesAdded: number
  errors: string[]
}> {
  const result = {
    success: false,
    instancesAdded: 0,
    errors: [] as string[]
  }

  try {
    console.log(`🧪 TEST 4: Adding stock to asset...`)

    const newSerialCodes = ['WM-004', 'WM-005']
    const success = await addAssetStock(assetName, newSerialCodes)

    if (success) {
      result.instancesAdded = newSerialCodes.length
      result.success = true
      console.log(`✓ Added ${newSerialCodes.length} new instances`)
    } else {
      result.errors.push('Failed to add stock')
    }

    console.log(`✅ TEST 4 Result: ${result.instancesAdded} instances added`)
    return result
  } catch (error) {
    result.errors.push(`TEST 4 Error: ${error instanceof Error ? error.message : String(error)}`)
    console.error('❌ TEST 4 Failed:', result.errors)
    return result
  }
}

/**
 * TEST 5: Add stock to consumable
 * Expected: Quantity increased
 */
export async function testAddConsumableStock(consumableId: string): Promise<{
  success: boolean
  quantityAdded: number
  errors: string[]
}> {
  const result = {
    success: false,
    quantityAdded: 0,
    errors: [] as string[]
  }

  try {
    console.log(`🧪 TEST 5: Adding consumable stock...`)

    const quantityToAdd = 25
    const success = await addConsumableStock(consumableId, quantityToAdd)

    if (success) {
      result.quantityAdded = quantityToAdd
      result.success = true
      console.log(`✓ Added ${quantityToAdd} units`)
    } else {
      result.errors.push('Failed to add consumable stock')
    }

    console.log(`✅ TEST 5 Result: ${result.quantityAdded} units added`)
    return result
  } catch (error) {
    result.errors.push(`TEST 5 Error: ${error instanceof Error ? error.message : String(error)}`)
    console.error('❌ TEST 5 Failed:', result.errors)
    return result
  }
}

/**
 * TEST SUITE: Run all tests in sequence
 */
export async function runAllTests() {
  console.log('🚀 Starting test suite for two-collection architecture...\n')

  const test1 = await testCreateAssets()
  console.log('')

  const test2 = await testCreateConsumables()
  console.log('')

  const test3 = await testLoadEquipment()
  console.log('')

  const test4 = await testAddAssetStock()
  console.log('')

  // Get a consumable ID from test2 results to test adding stock
  let consumableResult: Awaited<ReturnType<typeof testAddConsumableStock>> | null = null
  if (test2.createdIds.length > 0) {
    consumableResult = await testAddConsumableStock(test2.createdIds[0])
    console.log('')
  }

  // Summary
  const allPassed = test1.success && test2.success && test3.success && test4.success && consumableResult?.success
  console.log('\n' + '='.repeat(50))
  console.log(`📊 TEST RESULT: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`)
  console.log('='.repeat(50))

  return {
    test1,
    test2,
    test3,
    test4,
    consumableStock: consumableResult,
    allPassed
  }
}

/**
 * CLEANUP: Delete all test data
 * Use this to clean up after testing
 */
export async function cleanupTestData(createdAssetIds: string[], createdConsumableIds: string[]): Promise<{
  deleted: number
  errors: string[]
}> {
  const result = { deleted: 0, errors: [] as string[] }

  try {
    console.log('🧹 Cleaning up test data...')

    // Get all equipment and delete test items
    const equipmentResult = await loadAllEquipment()
    const allEquipment = equipmentResult.items

    for (const equipment of allEquipment) {
      const isTestAsset = createdAssetIds.includes(equipment.id)
      const isTestConsumable = createdConsumableIds.includes(equipment.id)

      if (isTestAsset || isTestConsumable) {
        try {
          await deleteEquipment(equipment)
          result.deleted++
          console.log(`✓ Deleted: ${equipment.name}`)
        } catch (error) {
          result.errors.push(`Failed to delete ${equipment.name}: ${error}`)
        }
      }
    }

    console.log(`✅ Cleanup complete: ${result.deleted} items deleted`)
    return result
  } catch (error) {
    result.errors.push(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`)
    console.error('❌ Cleanup failed:', result.errors)
    return result
  }
}
