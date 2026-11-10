import { wrap } from 'svelte-spa-router/wrap';
import Home from '../features/home/Home.svelte';
import ExpenseList from '../features/expenses/ExpenseList.svelte';

// The start page and expenses ship in the main bundle; every other page is
// its own chunk, fetched the first time it's opened (and kept by the
// service worker after that) — so the first load on a phone stays small.
const lazy = (load: () => Promise<{ default: unknown }>) =>
  wrap({ asyncComponent: load as Parameters<typeof wrap>[0]['asyncComponent'] });

const Storage = lazy(() => import('../features/storage/Storage.svelte'));
const StorageUnit = lazy(() => import('../features/storage/StorageUnit.svelte'));
const ProductsPage = lazy(() => import('../features/products/ProductsPage.svelte'));
const ProductPage = lazy(() => import('../features/products/ProductPage.svelte'));
const ShoppingList = lazy(() => import('../features/shopping/ShoppingList.svelte'));

export const routes = {
  '/': Home,
  '/expenses': ExpenseList,
  '/expenses/categories': lazy(() => import('../features/expenses/SortCategories.svelte')),
  '/settings': lazy(() => import('../features/groups/Settings.svelte')),
  '/documents': lazy(() => import('../features/documents/Documents.svelte')),
  '/shopping': ShoppingList,
  '/shopping/:listId': ShoppingList,
  '/storage': Storage,
  '/storage/history': lazy(() => import('../features/storage/StorageHistoryPage.svelte')),
  '/storage/import': lazy(() => import('../features/storage/ImportPage.svelte')),
  '/products': ProductsPage,
  '/products/:key': ProductPage,
  // Old links from before Products got its own tab.
  '/storage/products': ProductsPage,
  '/storage/products/:key': ProductPage,
  '/storage/:unitId': StorageUnit,
  '/reminders': lazy(() => import('../features/reminders/Reminders.svelte')),
  '/stats': lazy(() => import('../features/stats/Stats.svelte')),
  '/settleup': lazy(() => import('../features/settleup/SettleUp.svelte')),
  '/categories': lazy(() => import('../features/categories/CategoryAdmin.svelte')),
  '/export-import': lazy(() => import('../features/export-import/ExportImport.svelte')),
};
