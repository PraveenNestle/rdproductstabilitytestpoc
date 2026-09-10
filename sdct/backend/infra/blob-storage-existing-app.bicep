// Azure Blob Storage for an existing Stability Capture Web App.
// The Web App uses its system-assigned managed identity; no storage keys are used.
targetScope = 'resourceGroup'

@description('Storage account name. Must be globally unique, lowercase, and 3-24 characters.')
param storageName string
@description('Object ID of the existing Web App managed identity.')
param webAppPrincipalId string
@description('Allowed browser origin for direct media uploads.')
param allowedOrigin string
@description('Create managed-identity role assignments. Requires User Access Administrator or Owner.')
param assignRoles bool = true

var containers = [ 'reference', 'observations', 'media', 'curated', 'config' ]
var blobContributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var blobDelegatorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a')

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: resourceGroup().location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    accessTier: 'Hot'
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
  }
  tags: { application: 'RD Stability Data Collection Tool', managedBy: 'Bicep' }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    isVersioningEnabled: true
    changeFeed: { enabled: true, retentionInDays: 365 }
    deleteRetentionPolicy: { enabled: true, days: 30 }
    containerDeleteRetentionPolicy: { enabled: true, days: 30 }
    cors: {
      corsRules: [{
        allowedOrigins: [allowedOrigin]
        allowedMethods: [ 'PUT', 'GET', 'HEAD', 'OPTIONS' ]
        allowedHeaders: [ '*' ]
        exposedHeaders: [ '*' ]
        maxAgeInSeconds: 3600
      }]
    }
  }
}

resource blobContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [for container in containers: {
  parent: blobService
  name: container
  properties: { publicAccess: 'None' }
}]

resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    policy: { rules: [{
      name: 'media-tiering'
      enabled: true
      type: 'Lifecycle'
      definition: {
        filters: { blobTypes: [ 'blockBlob' ], prefixMatch: [ 'media/' ] }
        actions: { baseBlob: { tierToCool: { daysAfterModificationGreaterThan: 90 }, tierToArchive: { daysAfterModificationGreaterThan: 1095 } } }
      }
    }] }
  }
}

resource contributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignRoles) {
  name: guid(account.id, webAppPrincipalId, 'blob-contributor')
  scope: account
  properties: {
    roleDefinitionId: blobContributorRole
    principalId: webAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource delegator 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignRoles) {
  name: guid(account.id, webAppPrincipalId, 'blob-delegator')
  scope: account
  properties: {
    roleDefinitionId: blobDelegatorRole
    principalId: webAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output storageAccountName string = account.name
output blobEndpoint string = account.properties.primaryEndpoints.blob