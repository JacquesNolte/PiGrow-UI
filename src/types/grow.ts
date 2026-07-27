export enum DeviceType {
  LIGHT = 'LIGHT',
  EXHAUST_FAN = 'EXHAUST_FAN',
  INTAKE_FAN = 'INTAKE_FAN',
  CIRCULATION_FAN = 'CIRCULATION_FAN',
  WATER_PUMP = 'WATER_PUMP',
  AIR_CONDITIONER = 'AIR_CONDITIONER',
  HEATER = 'HEATER',
  HUMIDIFIER = 'HUMIDIFIER',
  DEHUMIDIFIER = 'DEHUMIDIFIER',
  CO2_INJECTOR = 'CO2_INJECTOR',
}

export enum SensorType {
  HUMIDITY = 'HUMIDITY',
  TEMPERATURE = 'TEMPERATURE',
  TEMP_HUMIDITY = 'TEMP_HUMIDITY',
  CO2 = 'CO2',
  PH = 'PH',
  EC = 'EC',
}

export enum SensorProtocol {
  I2C = 'I2C',
  SPI = 'SPI',
  UART = 'UART',
  RS485 = 'RS485',
}

export enum AutomationMode {
  MANUAL = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
  THRESHOLD = 'THRESHOLD',
  ALWAYS_ON = 'ALWAYS_ON',
  ALWAYS_OFF = 'ALWAYS_OFF',
}

export enum DayNightPeriod {
  DAY = 'DAY',
  NIGHT = 'NIGHT',
}

export enum RuleCondition {
  ABOVE_MAX = 'ABOVE_MAX',
  BELOW_MIN = 'BELOW_MIN',
  BELOW_MAX = 'BELOW_MAX',
  ABOVE_MIN = 'ABOVE_MIN',
  ABOVE_TARGET = 'ABOVE_TARGET',
  BELOW_TARGET = 'BELOW_TARGET',
  ALWAYS_ON = 'ALWAYS_ON',
  ALWAYS_OFF = 'ALWAYS_OFF',
  INTERVAL = 'INTERVAL',
  SCHEDULE_ON = 'SCHEDULE_ON',
  SCHEDULE_OFF = 'SCHEDULE_OFF',
}

export enum DeviceAction {
  ON = 'ON',
  OFF = 'OFF',
}

export interface Device {
  id: string
  controllerId: string
  name: string
  type: DeviceType
  pinNumber: number
  automationMode: AutomationMode
  isActive: boolean
  maxOnSeconds?: number | null
  createdAt: string
  updatedAt: string
  controller?: Controller
  localKey?: string
}

export interface DeviceSeed {
  name: string
  type: DeviceType
  pinNumber: number
  automationMode?: AutomationMode
  isActive?: boolean
  maxOnSeconds?: number | null
}

export interface HardwareManifestSensor {
  type: string
  protocol: string
  i2cBus?: number
  i2cAddr?: number
  pin?: number
  interval: number
}

export interface HardwareManifestRelay {
  type: string
  pin: number
  name?: string
}

export interface HardwareManifest {
  sensors: HardwareManifestSensor[]
  relays: HardwareManifestRelay[]
}

export interface DiscoveredController {
  mac: string
  ip: string
  serial: string
  fwVersion: string
  pinActive: boolean
  hwManifest: HardwareManifest
}

export interface ScanResponse {
  controllers: DiscoveredController[]
}

export interface ClaimRequest {
  mac: string
  claimPin: string
  name: string
}

export interface ClaimResponse {
  controller: Controller
}

export interface DeviceStateUpdate {
  deviceId: string
  isActive: boolean
}

export interface Sensor {
  id: string
  controllerId: string
  name: string
  type: SensorType
  pinNumbers: number[]
  protocol: SensorProtocol
  lastActive?: string | null
  createdAt: string
  updatedAt: string
  localKey?: string
}

export interface SensorSeed {
  name: string
  type: SensorType
  pinNumbers: number[]
  protocol: SensorProtocol
}

export interface Controller {
  id: string
  macAddress: string
  ipAddress: string
  name: string
  status: 'ONLINE' | 'OFFLINE' | 'ERROR'
  growCycles?: GrowCycle[]
  sensors?: Sensor[]
  devices?: Device[]
  createdAt: string
  updatedAt: string
}

export interface GrowCycleListItem {
  id: string
  controllerId: string
  name: string
  isActive: boolean
  startAt: string | null
  createdAt: string
  updatedAt: string
  controller: {
    name: string
    status: 'ONLINE' | 'OFFLINE' | 'ERROR'
  }
}

export interface GrowCycle {
  id: string
  controllerId: string
  name: string
  isActive: boolean
  startAt: string | null
  createdAt: string
  updatedAt: string
  controller?: Controller
  phases?: GrowPhase[]
}

export interface PhaseEnvironment {
  id: string
  growPhaseId: string
  period: DayNightPeriod
  tempMin: number | null
  tempMax: number | null
  tempTarget: number | null
  humidityMin: number | null
  humidityMax: number | null
  humidityTarget: number | null
  co2Min: number | null
  co2Max: number | null
  co2Target: number | null
  createdAt: string
  updatedAt: string
}

export interface PhaseEnvironmentPayload {
  tempMin?: number | null
  tempMax?: number | null
  tempTarget?: number | null
  humidityMin?: number | null
  humidityMax?: number | null
  humidityTarget?: number | null
  co2Min?: number | null
  co2Max?: number | null
  co2Target?: number | null
}

export interface GrowPhase {
  id?: string
  growCycleId?: string
  name: string
  order: number
  durationDays: number
  dayStartMinutes?: number
  dayDurationMinutes?: number
  isActive: boolean
  startAt: string | null
  endAt: string | null
  phMin: number | null
  phTarget: number | null
  phMax: number | null
  environments?: PhaseEnvironment[]
  createdAt?: string
  updatedAt?: string
  localKey?: string
}

export interface AutomationRule {
  id: string
  growCycleId: string | null
  growPhaseId: string | null
  deviceId: string
  watchedSensorType: SensorType | null
  period: DayNightPeriod | null
  condition: RuleCondition
  action: DeviceAction
  cooldownSeconds: number
  intervalOnSeconds: number | null
  intervalCycleSeconds: number | null
  scheduleTimeMinutes: number | null
  enabled: boolean
  lastTriggeredAt: string | null
  createdAt: string
  updatedAt: string
  device?: Device
}

export interface CreateAutomationRulePayload {
  growPhaseId: string
  deviceId: string
  watchedSensorType: SensorType | null
  period: DayNightPeriod | null
  condition: RuleCondition
  action: DeviceAction
  cooldownSeconds?: number
  intervalOnSeconds?: number
  intervalCycleSeconds?: number
  scheduleTimeMinutes?: number
  enabled?: boolean
}

export interface UpdateAutomationRulePayload {
  deviceId?: string
  watchedSensorType?: SensorType | null
  period?: DayNightPeriod | null
  condition?: RuleCondition
  action?: DeviceAction
  cooldownSeconds?: number
  intervalOnSeconds?: number | null
  intervalCycleSeconds?: number | null
  scheduleTimeMinutes?: number | null
  enabled?: boolean
}

export interface Telemetry {
  id: string
  growCycleId: string
  sensorId: string
  sensorType: SensorType
  value: number
  createdAt: string
  sensor?: {
    id: string
    name: string
    type: SensorType
    protocol: SensorProtocol
  }
}

export interface FrontendTelemetry {
  sensorId: string
  sensorName: string
  sensorType: SensorType
  value: number
  growCycleId: string
  timestamp: string
}

export interface Nutrient {
  id: string
  name: string
  brand: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateNutrientPayload {
  name: string
  brand?: string | null
  notes?: string | null
}

export interface UpdateNutrientPayload {
  name?: string
  brand?: string | null
  notes?: string | null
}

export interface PhaseNutrient {
  id: string
  growPhaseId: string
  nutrientId: string
  doseMlPerL: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreatePhaseNutrientPayload {
  nutrientId: string
  doseMlPerL: number
  sortOrder?: number
}

export interface UpdatePhaseNutrientPayload {
  doseMlPerL?: number
  sortOrder?: number
}

export type DosingWarningCode = 'NO_NUTRIENTS_CONFIGURED' | 'NO_PH_BANDS' | 'RESERVOIR_TOO_SMALL'

export interface DosingLogLine {
  id: string
  dosingLogId: string
  nutrientId: string
  doseMlPerL: number
  computedMl: number
}

export interface DosingLog {
  id: string
  growPhaseId: string
  waterVolumeLiters: number
  totalMl: number
  warnings: DosingWarningCode[]
  measuredPh: number | null
  measuredEc: number | null
  notes: string | null
  createdAt: string
  lines: DosingLogLine[]
}

export interface CreateDosingLogPayload {
  waterVolumeLiters: number
  measuredPh?: number | null
  measuredEc?: number | null
  notes?: string | null
}

export interface UICommand {
  deviceId: string
  action: 'ON' | 'OFF'
  pin: number
}

export interface TelemetryFilterParams {
  from: string
  to: string
}

export interface DeviceStateLog {
  id: string
  deviceId: string
  action: DeviceAction
  source: 'MANUAL' | 'AUTO' | 'UI'
  reason: string | null
  createdAt: string
}

// TODO: when a device history view is built, render `reason` tolerating new
// AUTO reason strings: "day cycle start (phase <id>)", "night cycle start
// (phase <id>)", "ALWAYS_ON rule (<id>)", "ALWAYS_OFF rule (<id>)" (alongside
// The existing "TEMPERATURE 31.2 > max 28 (DAY)" and "state confirmed").
