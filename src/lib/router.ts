import ExpenseList from '../features/expenses/ExpenseList.svelte';
import Settings from '../features/groups/Settings.svelte';
import Stats from '../features/stats/Stats.svelte';
import SettleUp from '../features/settleup/SettleUp.svelte';
import ExportImport from '../features/export-import/ExportImport.svelte';
import CategoryAdmin from '../features/categories/CategoryAdmin.svelte';
import Documents from '../features/documents/Documents.svelte';
import Reminders from '../features/reminders/Reminders.svelte';
import ShoppingList from '../features/shopping/ShoppingList.svelte';
import Storage from '../features/storage/Storage.svelte';
import StorageUnit from '../features/storage/StorageUnit.svelte';
import StorageHistoryPage from '../features/storage/StorageHistoryPage.svelte';
import ImportPage from '../features/storage/ImportPage.svelte';

export const routes = {
  '/': ExpenseList,
  '/settings': Settings,
  '/documents': Documents,
  '/shopping': ShoppingList,
  '/storage': Storage,
  '/storage/history': StorageHistoryPage,
  '/storage/import': ImportPage,
  '/storage/:unitId': StorageUnit,
  '/reminders': Reminders,
  '/stats': Stats,
  '/settleup': SettleUp,
  '/categories': CategoryAdmin,
  '/export-import': ExportImport,
};
