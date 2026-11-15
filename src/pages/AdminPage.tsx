import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderTree,
  Globe,
  Layers,
  Mail,
  Package,
  Plus,
  Settings,
  ShieldAlert,
  Tag,
  Ticket,
  Trash2,
  Upload,
  UserCog,
  Users,
} from 'lucide-react';
import { EcosystemIcon } from '../components/EcosystemIcon';
import { SeoHead } from '../components/SeoHead';
import {
  AdminCustomersTab,
  type AdminCustomerSummary,
} from '../components/admin/AdminCustomersTab';
import {
  AdminEmailTab,
  AdminInfraTab,
  AdminReportsTab,
} from '../components/admin/AdminInfraEmailReportsTabs';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminSupportTab } from '../components/admin/AdminSupportTab';
import { ReauthModal } from '../components/admin/ReauthModal';
import { useStore } from '../context/StoreContext';
import { formatMinorPrice } from '../lib/format';
import { ROLE_LABELS, type AdminPermission } from '../lib/rbac';
import type {
  AccountEventRecord,
  Bundle,
  Category,
  EcosystemPlatform,
  EmailLogRecord,
  InfraComponentReport,
  Product,
  StoreCollection,
  SupportCaseRecord,
  SystemEventRecord,
} from '../types/store';

type AdminTab =
  | 'overview'
  | 'customers'
  | 'support'
  | 'orders'
  | 'products'
  | 'categories'
  | 'bundles'
  | 'ecosystem'
  | 'marketing'
  | 'infrastructure'
  | 'email'
  | 'reports'
  | 'settings'
  | 'guides';

interface AdminOverviewData {
  callerRole: string;
  callerPermissions: AdminPermission[];
  availableRoles: { value: string; label: string }[];
  analytics: {
    productViews: number;
    outboundSelarClicks: number;
    freeDownloads: number;
    protectedDownloadsCount?: number;
    confirmedNativeOrders: number;
    pendingOrdersCount?: number;
    failedOrdersCount?: number;
    refundedOrdersCount?: number;
    totalOrdersCount?: number;
    confirmedRevenueNgnKobo: number;
    confirmedRevenueUsdCents: number;
    totalCustomers?: number;
    totalAccounts?: number;
    newRegistrations7d?: number;
    publishedProducts?: number;
    openSupportCasesCount?: number;
    unresolvedIncidentsCount?: number;
    trafficSources: { source: string; count: number }[];
    geoDistribution: { country: string; count: number }[];
    perProduct: { slug: string; views: number; selarClicks: number }[];
  };
  products: Product[];
  categories: Category[];
  bundles: Bundle[];
  collections: StoreCollection[];
  ecosystemPlatforms: EcosystemPlatform[];
  orders: any[];
  customers: AdminCustomerSummary[];
  subscribers: any[];
  enquiries: any[];
  supportCases: SupportCaseRecord[];
  discounts: any[];
  settings: Record<string, string>;
  paystackEnvConfigured: boolean;
  integrationStatus?: {
    paystack: {
      secretKeyConfigured: boolean;
      publicKeyConfigured: boolean;
      webhookSecretConfigured: boolean;
      webhookVerificationConfigured: boolean;
      testKeyBlockedInProduction: boolean;
      nativeCheckoutActive: boolean;
    };
    pinterest: {
      configured: boolean;
      source: 'settings' | 'env' | 'none';
    };
    googleAnalytics: {
      configured: boolean;
    };
    downloadSigning?: {
      configured: boolean;
    };
  };
  emailStatus?: {
    configured: boolean;
    provider: 'smtp' | 'resend' | 'unconfigured';
    supportAddress: string;
    businessAddress: string;
    fromAddress: string;
    firebaseAuthEmailActive: boolean;
    detailMessage: string;
  };
  emailLogs?: EmailLogRecord[];
  infrastructure?: {
    checkedAt: string;
    components: InfraComponentReport[];
    recentEvents: SystemEventRecord[];
  };
  recentAccountActivity?: AccountEventRecord[];
  auditLogs: any[];
}

export function AdminPage() {
  const {
    firebaseUser,
    profile,
    isConsoleAuthorized,
    hasAdminPermission,
    authLoading,
    authError,
    signInWithEmail,
    signInWithGoogle,
    getAuthHeaders,
    refreshStorefront,
    navigate,
  } = useStore();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Admin email/password login gate state (when unauthenticated)
  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginPw, setAdminLoginPw] = useState('');
  const [showAdminPw, setShowAdminPw] = useState(false);
  const [adminLoginBusy, setAdminLoginBusy] = useState(false);

  // Interactive Reauthentication Modal state
  const [reauthPendingAction, setReauthPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);

  // Product editor state
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [ngnInput, setNgnInput] = useState('');
  const [origNgnInput, setOrigNgnInput] = useState('');
  const [usdInput, setUsdInput] = useState('');
  const [origUsdInput, setOrigUsdInput] = useState('');
  const [contentsText, setContentsText] = useState('');
  const [benefitsText, setBenefitsText] = useState('');
  const [audienceText, setAudienceText] = useState('');
  const [faqsDraft, setFaqsDraft] = useState<{ question: string; answer: string }[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingProtected, setUploadingProtected] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [togglingProductId, setTogglingProductId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Category & collection editor state
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [subtopicsInput, setSubtopicsInput] = useState('');
  const [editingCollection, setEditingCollection] = useState<StoreCollection | null>(null);

  // Ecosystem platform editor state
  const [editingPlatform, setEditingPlatform] = useState<Partial<EcosystemPlatform> | null>(null);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [uploadingPlatformLogo, setUploadingPlatformLogo] = useState(false);
  const [confirmDeletePlatformId, setConfirmDeletePlatformId] = useState<number | null>(null);

  // Bundle creator / editor state
  const [editingBundleId, setEditingBundleId] = useState<number | null>(null);
  const [newBundle, setNewBundle] = useState({
    name: '',
    slug: '',
    description: '',
    priceNgn: '',
    priceUsd: '',
    marketplaceUrl: '',
    status: 'published',
    isFeatured: false,
    productIds: [] as number[],
  });

  // Discount creator state
  const [newDiscount, setNewDiscount] = useState({
    code: '',
    discountType: 'percent',
    value: '10',
    maxUses: '',
  });

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});

  const loadAdminData = useCallback(async () => {
    if (!firebaseUser || !isConsoleAuthorized) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/overview', { headers });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Unable to load admin workspace.');
        return;
      }
      setData(json);
      setSettingsForm(json.settings || {});
    } catch {
      setError('Failed to connect to admin API.');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, isConsoleAuthorized, getAuthHeaders]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const openProductEditor = (p?: Product) => {
    if (!p) {
      setEditingProduct({
        name: '',
        slug: '',
        shortBenefit: '',
        shortDescription: '',
        fullDescription: '',
        categoryId: data?.categories[0]?.id ?? null,
        coverImage: '',
        fileFormat: 'PDF',
        version: '1.0',
        licenceType: 'Single Personal Use Licence',
        requirements: '',
        instructions: '',
        seoTitle: '',
        seoDescription: '',
        status: 'published',
        checkoutMode: 'selar',
        marketplaceUrl: '',
        isFeatured: true,
        isNewArrival: true,
        isBestseller: false,
        isFree: false,
        nativeCheckoutEligible: false,
        sortOrder: (data?.products.length || 0) + 1,
        relatedProductIds: [],
        ecosystemName: '',
        ecosystemUrl: '',
        ecosystemPitch: '',
      });
      setNgnInput('');
      setOrigNgnInput('');
      setUsdInput('');
      setOrigUsdInput('');
      setContentsText('');
      setBenefitsText('');
      setAudienceText('');
      setFaqsDraft([]);
      return;
    }
    setEditingProduct({
      ...p,
      sortOrder: p.sortOrder ?? 0,
      relatedProductIds: Array.isArray(p.relatedProductIds) ? p.relatedProductIds : [],
    });
    setNgnInput(p.priceNgnKobo !== null ? String(p.priceNgnKobo / 100) : '');
    setOrigNgnInput(
      p.originalPriceNgnKobo !== null ? String(p.originalPriceNgnKobo / 100) : ''
    );
    setUsdInput(p.priceUsdCents !== null ? String(p.priceUsdCents / 100) : '');
    setOrigUsdInput(
      p.originalPriceUsdCents !== null ? String(p.originalPriceUsdCents / 100) : ''
    );
    setContentsText((p.contentsList || []).join('\n'));
    setBenefitsText((p.keyBenefits || []).join('\n'));
    setAudienceText((p.intendedAudience || []).join('\n'));
    setFaqsDraft(Array.isArray(p.faqs) ? p.faqs.map((f) => ({ ...f })) : []);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || savingProduct) return;
    setSavingProduct(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };

      const payload = {
        ...editingProduct,
        sortOrder: Number(editingProduct.sortOrder ?? 0),
        relatedProductIds: Array.isArray(editingProduct.relatedProductIds)
          ? editingProduct.relatedProductIds
          : [],
        priceNgnKobo: ngnInput.trim() ? Math.round(Number(ngnInput) * 100) : null,
        originalPriceNgnKobo: origNgnInput.trim()
          ? Math.round(Number(origNgnInput) * 100)
          : null,
        priceUsdCents: usdInput.trim() ? Math.round(Number(usdInput) * 100) : null,
        originalPriceUsdCents: origUsdInput.trim()
          ? Math.round(Number(origUsdInput) * 100)
          : null,
        contentsList: contentsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        keyBenefits: benefitsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        intendedAudience: audienceText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        faqs: faqsDraft
          .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
          .filter((f) => f.question && f.answer),
      };

      const isUpdate = Boolean(editingProduct.id);
      const url = isUpdate
        ? `/api/admin/products/${editingProduct.id}`
        : '/api/admin/products';

      const res = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Failed to save product.');
        return;
      }

      setEditingProduct(null);
      showToast(`Saved "${json.product.name}".`);
      await Promise.all([loadAdminData(), refreshStorefront()]);
    } catch {
      showToast('Network error while saving product.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleTogglePublish = async (p: Product) => {
    if (togglingProductId !== null) return;
    const nextStatus = p.status === 'published' ? 'draft' : 'published';
    setTogglingProductId(p.id);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch(`/api/admin/products/${p.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Unable to update publication status.');
        return;
      }
      showToast(
        nextStatus === 'published'
          ? `Published "${p.name}" to storefront.`
          : `Unpublished "${p.name}" (moved to draft).`
      );
      await Promise.all([loadAdminData(), refreshStorefront()]);
    } catch {
      showToast('Network error while updating status.');
    } finally {
      setTogglingProductId(null);
    }
  };

  const handleDeleteProduct = async (id: number, name: string) => {
    const execute = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/admin/products/${id}`, {
          method: 'DELETE',
          headers,
        });
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          setReauthPendingAction(() => execute);
          return;
        }
        if (!res.ok) {
          showToast(json.error || 'Unable to delete product.');
          return;
        }
        setConfirmDeleteId(null);
        showToast(`Deleted "${name}".`);
        await Promise.all([loadAdminData(), refreshStorefront()]);
      } catch {
        showToast('Network error while deleting product.');
      }
    };
    await execute();
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/upload/image', {
        method: 'POST',
        headers,
        body: formData,
      });
      const json = await res.json();
      if (res.ok && json.url) {
        setEditingProduct((prev) => (prev ? { ...prev, coverImage: json.url } : prev));
        showToast('Cover image uploaded.');
      } else {
        showToast(json.error || 'Image upload failed.');
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleProtectedFileUpload = async (productId: number, file: File) => {
    setUploadingProtected(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/upload/product-file/${productId}`, {
        method: 'POST',
        headers,
        body: formData,
      });
      const json = await res.json();
      if (res.ok) {
        setEditingProduct(json.product);
        showToast('Protected downloadable file uploaded.');
        await loadAdminData();
      } else {
        showToast(json.error || 'Protected file upload failed.');
      }
    } finally {
      setUploadingProtected(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const headers = {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
    };
    const isUpdate = Boolean(editingCategory.id);
    const payload = {
      ...editingCategory,
      subtopics: subtopicsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const res = await fetch(
      isUpdate
        ? `/api/admin/categories/${editingCategory.id}`
        : '/api/admin/categories',
      {
        method: isUpdate ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Unable to save department.');
      return;
    }
    setEditingCategory(null);
    setSubtopicsInput('');
    showToast('Department saved.');
    await Promise.all([loadAdminData(), refreshStorefront()]);
  };

  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollection) return;
    const headers = {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
    };
    const res = await fetch(`/api/admin/collections/${editingCollection.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        title: editingCollection.title,
        subtitle: editingCollection.subtitle,
        productIds: editingCollection.productIds || [],
        isActive: editingCollection.isActive,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Unable to update collection.');
      return;
    }
    setEditingCollection(null);
    showToast('Collection updated.');
    await Promise.all([loadAdminData(), refreshStorefront()]);
  };

  const resetBundleForm = () => {
    setEditingBundleId(null);
    setNewBundle({
      name: '',
      slug: '',
      description: '',
      priceNgn: '',
      priceUsd: '',
      marketplaceUrl: '',
      status: 'published',
      isFeatured: false,
      productIds: [],
    });
  };

  const handleSaveBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    const headers = {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
    };
    const url = editingBundleId
      ? `/api/admin/bundles/${editingBundleId}`
      : '/api/admin/bundles';
    const res = await fetch(url, {
      method: editingBundleId ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify({
        ...newBundle,
        priceNgnKobo: newBundle.priceNgn ? Math.round(Number(newBundle.priceNgn) * 100) : null,
        priceUsdCents: newBundle.priceUsd ? Math.round(Number(newBundle.priceUsd) * 100) : null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Unable to save bundle.');
      return;
    }
    resetBundleForm();
    showToast(editingBundleId ? 'Bundle updated.' : 'Bundle created.');
    await Promise.all([loadAdminData(), refreshStorefront()]);
  };

  const openPlatformEditor = (platform?: EcosystemPlatform) => {
    if (!platform) {
      setEditingPlatform({
        name: '',
        slug: '',
        category: 'Education & Learning',
        relatedCategorySlug: data?.categories[0]?.slug || '',
        description: '',
        destinationUrl: '',
        iconName: 'Layers',
        logoUrl: '',
        status: 'published',
        isFeatured: true,
        sortOrder: (data?.ecosystemPlatforms?.length || 0) + 1,
      });
      return;
    }
    setEditingPlatform({
      ...platform,
      destinationUrl: platform.destinationUrl || '',
      logoUrl: platform.logoUrl || '',
      relatedCategorySlug: platform.relatedCategorySlug || '',
    });
  };

  const handlePlatformLogoUpload = async (file: File) => {
    setUploadingPlatformLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/upload/image', {
        method: 'POST',
        headers,
        body: formData,
      });
      const json = await res.json();
      if (res.ok && json.url) {
        setEditingPlatform((prev) => (prev ? { ...prev, logoUrl: json.url } : prev));
        showToast('Platform logo uploaded.');
      } else {
        showToast(json.error || 'Logo upload failed.');
      }
    } finally {
      setUploadingPlatformLogo(false);
    }
  };

  const handleSavePlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlatform || savingPlatform) return;
    setSavingPlatform(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const isUpdate = Boolean(editingPlatform.id);
      const res = await fetch(
        isUpdate
          ? `/api/admin/ecosystem/${editingPlatform.id}`
          : '/api/admin/ecosystem',
        {
          method: isUpdate ? 'PATCH' : 'POST',
          headers,
          body: JSON.stringify({
            ...editingPlatform,
            sortOrder: Number(editingPlatform.sortOrder ?? 0),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Unable to save ecosystem platform.');
        return;
      }
      setEditingPlatform(null);
      showToast(`Saved "${json.platform.name}".`);
      await Promise.all([loadAdminData(), refreshStorefront()]);
    } catch {
      showToast('Network error while saving platform.');
    } finally {
      setSavingPlatform(false);
    }
  };

  const handleTogglePlatformStatus = async (platform: EcosystemPlatform) => {
    const nextStatus = platform.status === 'published' ? 'draft' : 'published';
    const headers = {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
    };
    const res = await fetch(`/api/admin/ecosystem/${platform.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      showToast('Unable to update platform status.');
      return;
    }
    showToast(
      nextStatus === 'published'
        ? `Published "${platform.name}" in directory.`
        : `Moved "${platform.name}" to draft.`
    );
    await Promise.all([loadAdminData(), refreshStorefront()]);
  };

  const handleDeletePlatform = async (id: number, name: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/ecosystem/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      showToast('Unable to delete platform.');
      return;
    }
    setConfirmDeletePlatformId(null);
    showToast(`Deleted "${name}".`);
    await Promise.all([loadAdminData(), refreshStorefront()]);
  };

  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    const headers = {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
    };
    const res = await fetch('/api/admin/discounts', {
      method: 'POST',
      headers,
      body: JSON.stringify(newDiscount),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Unable to create discount code.');
      return;
    }
    setNewDiscount({ code: '', discountType: 'percent', value: '10', maxUses: '' });
    showToast('Discount code created.');
    await loadAdminData();
  };

  const handleToggleDiscount = async (id: number, currentActive: boolean) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders()),
    };
    const res = await fetch(`/api/admin/discounts/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isActive: !currentActive }),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Unable to update discount code.');
      return;
    }
    showToast(`Discount ${json.discount.code} ${json.discount.isActive ? 'activated' : 'paused'}.`);
    await loadAdminData();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSettings) return;
    const execute = async () => {
      setSavingSettings(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        };
        const res = await fetch('/api/admin/settings', {
          method: 'PATCH',
          headers,
          body: JSON.stringify(settingsForm),
        });
        const json = await res.json();
        if (res.status === 403 && json.code === 'REAUTH_REQUIRED') {
          setReauthPendingAction(() => execute);
          return;
        }
        if (!res.ok) {
          showToast(json.error || 'Unable to update store settings.');
          return;
        }
        showToast('Store settings updated.');
        await Promise.all([loadAdminData(), refreshStorefront()]);
      } catch {
        showToast('Network error while saving settings.');
      } finally {
        setSavingSettings(false);
      }
    };
    await execute();
  };

  const handleExportOrdersCsv = async () => {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/orders/export', { headers });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jeneconk-orders.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = useMemo(() => {
    const items: {
      id: AdminTab;
      label: string;
      icon: React.ReactNode;
      visible: boolean;
    }[] = [
      {
        id: 'overview',
        label: 'Operations Overview',
        icon: <BarChart3 className="w-4 h-4" />,
        visible: hasAdminPermission('view_overview'),
      },
      {
        id: 'customers',
        label: 'Customers',
        icon: <UserCog className="w-4 h-4" />,
        visible: hasAdminPermission('view_customers'),
      },
      {
        id: 'support',
        label: 'Support Cases',
        icon: <Ticket className="w-4 h-4" />,
        visible:
          hasAdminPermission('manage_support_cases') ||
          hasAdminPermission('view_customers'),
      },
      {
        id: 'orders',
        label: 'Orders & Txns',
        icon: <Users className="w-4 h-4" />,
        visible: hasAdminPermission('view_orders'),
      },
      {
        id: 'products',
        label: 'Products',
        icon: <Package className="w-4 h-4" />,
        visible: hasAdminPermission('manage_catalog'),
      },
      {
        id: 'categories',
        label: 'Departments',
        icon: <FolderTree className="w-4 h-4" />,
        visible: hasAdminPermission('manage_catalog'),
      },
      {
        id: 'bundles',
        label: 'Bundles',
        icon: <Layers className="w-4 h-4" />,
        visible: hasAdminPermission('manage_catalog'),
      },
      {
        id: 'ecosystem',
        label: 'Ecosystem',
        icon: <Globe className="w-4 h-4" />,
        visible: hasAdminPermission('manage_catalog'),
      },
      {
        id: 'marketing',
        label: 'Promotions',
        icon: <Tag className="w-4 h-4" />,
        visible: hasAdminPermission('manage_catalog'),
      },
      {
        id: 'infrastructure',
        label: 'Infrastructure',
        icon: <Activity className="w-4 h-4" />,
        visible: hasAdminPermission('view_infra'),
      },
      {
        id: 'email',
        label: 'Business Email',
        icon: <Mail className="w-4 h-4" />,
        visible:
          hasAdminPermission('manage_settings') ||
          hasAdminPermission('view_infra') ||
          hasAdminPermission('manage_support_cases'),
      },
      {
        id: 'reports',
        label: 'Reports & CSV',
        icon: <FileSpreadsheet className="w-4 h-4" />,
        visible: hasAdminPermission('view_reports'),
      },
      {
        id: 'settings',
        label: 'Settings & Audit',
        icon: <Settings className="w-4 h-4" />,
        visible: hasAdminPermission('manage_settings') || hasAdminPermission('manage_roles'),
      },
      {
        id: 'guides',
        label: 'Runbooks & Guides',
        icon: <BookOpen className="w-4 h-4" />,
        visible: true,
      },
    ];
    return items.filter((i) => i.visible);
  }, [hasAdminPermission]);

  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="h-48 bg-white border border-[#E4DDD0] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 space-y-6">
        <div className="bg-white border border-[#D5CCB9] rounded-xl p-6 sm:p-8 space-y-5">
          <div className="text-center space-y-2">
            <ShieldAlert className="w-9 h-9 text-[#0A264A] mx-auto" />
            <h1 className="font-display text-2xl font-bold text-slate-900">
              Operations Console Sign-In
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sign in with your authorised Jeneconk operations staff account. Public staff sign-up is disabled.
            </p>
          </div>
          {authError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-lg">
              {authError}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAdminLoginBusy(true);
              await signInWithEmail({
                email: adminLoginEmail,
                password: adminLoginPw,
                rememberMe: true,
              });
              setAdminLoginBusy(false);
            }}
            className="space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Staff Email
              </label>
              <input
                type="email"
                required
                value={adminLoginEmail}
                onChange={(e) => setAdminLoginEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showAdminPw ? 'text' : 'password'}
                  required
                  value={adminLoginPw}
                  onChange={(e) => setAdminLoginPw(e.target.value)}
                  className="w-full pr-10 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showAdminPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={adminLoginBusy}
              className="w-full py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg disabled:opacity-60"
            >
              {adminLoginBusy ? 'Signing In...' : 'Sign In with Email'}
            </button>
          </form>
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="shrink mx-3 text-[11px] uppercase tracking-wider text-slate-400">
              Or
            </span>
            <div className="flex-grow border-t border-slate-200" />
          </div>
          <button
            type="button"
            onClick={() => signInWithGoogle(true)}
            className="w-full py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg"
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  if (profile && !isConsoleAuthorized) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Operations Console Permission Required
        </h1>
        <p className="text-sm text-slate-600">
          Signed in as {firebaseUser.email}, which holds a standard customer role. Only authorised Jeneconk staff can access this operations console.
        </p>
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0A264A] rounded-lg"
        >
          Return to Customer Account
        </button>
      </div>
    );
  }

  return (
    <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <SeoHead
        title="Operations Centre | Jeneconk Digital Store"
        description="Jeneconk Digital Store administration and infrastructure operations console."
        path="/admin"
      />

      <ReauthModal
        open={Boolean(reauthPendingAction)}
        onClose={() => setReauthPendingAction(null)}
        onSuccess={async () => {
          const fn = reauthPendingAction;
          setReauthPendingAction(null);
          if (fn) await fn();
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E4DDD0] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              Store Operations &amp; Infrastructure Centre
            </h1>
            {profile && (
              <span className="px-2.5 py-0.5 text-[11px] font-mono bg-[#0A264A] text-white rounded">
                {ROLE_LABELS[profile.role] || profile.role}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Signed in as {firebaseUser.email} · Jeneconk Integrated Global Solutions Limited
          </p>
        </div>
        {hasAdminPermission('manage_catalog') && (
          <button
            type="button"
            onClick={() => {
              setTab('products');
              openProductEditor();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Digital Product</span>
          </button>
        )}
      </div>

      {toast && (
        <div className="bg-slate-900 text-white text-sm px-4 py-3 rounded-lg">
          {toast}
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Mobile Horizontal Tabs */}
      <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#E4DDD0]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
              tab === t.id
                ? 'bg-[#0A264A] text-white'
                : 'bg-white text-slate-700 border border-[#E4DDD0]'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Desktop Persistent 220px SaaS Sidebar */}
        <aside className="hidden lg:flex flex-col w-[220px] shrink-0 bg-white border border-[#E4DDD0] rounded-xl p-2 space-y-1 sticky top-24">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold rounded-lg text-left transition-colors ${
                tab === t.id
                  ? 'bg-[#0A264A] text-white'
                  : 'text-slate-700 hover:bg-[#FAF8F4]'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </aside>

        <div className="flex-1 min-w-0 w-full space-y-8">
      {loading && !data ? (
        <div className="h-64 bg-white border border-[#E4DDD0] rounded-xl animate-pulse" />
      ) : data ? (
        <>
          {/* TAB 1: OPERATIONS OVERVIEW (BUSINESS + SYSTEM SUMMARY) */}
          {tab === 'overview' && (
            <div className="space-y-8">
              <div>
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Business &amp; Storefront Overview
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-[#E4DDD0] rounded-xl p-4">
                    <p className="text-xs text-slate-500">Registered Customers</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                      {data.analytics.totalCustomers ?? data.customers.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      +{data.analytics.newRegistrations7d ?? 0} in last 7 days
                    </p>
                  </div>
                  <div className="bg-white border border-[#E4DDD0] rounded-xl p-4">
                    <p className="text-xs text-slate-500">Published Catalog</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                      {data.analytics.publishedProducts ?? data.products.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Views: {data.analytics.productViews} · Selar clicks: {data.analytics.outboundSelarClicks}
                    </p>
                  </div>
                  <div className="bg-white border border-[#E4DDD0] rounded-xl p-4">
                    <p className="text-xs text-slate-500">Native Orders (Paid / Pending / Failed)</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-[#0A264A] tabular-nums">
                      {data.analytics.confirmedNativeOrders} / {data.analytics.pendingOrdersCount ?? 0} /{' '}
                      {data.analytics.failedOrdersCount ?? 0}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Free unlocks: {data.analytics.freeDownloads}
                    </p>
                  </div>
                  <div className="bg-white border border-[#E4DDD0] rounded-xl p-4">
                    <p className="text-xs text-slate-500">Confirmed Native Revenue</p>
                    <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
                      {formatMinorPrice(data.analytics.confirmedRevenueNgnKobo, 'NGN')} ·{' '}
                      {formatMinorPrice(data.analytics.confirmedRevenueUsdCents, 'USD')}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Selar revenue settles on Selar dashboard
                    </p>
                  </div>
                </div>
              </div>

              {data.infrastructure && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display text-sm font-bold uppercase tracking-wider text-slate-500">
                      Real System &amp; Integration Status
                    </h2>
                    {hasAdminPermission('view_infra') && (
                      <button
                        type="button"
                        onClick={() => setTab('infrastructure')}
                        className="text-xs font-semibold text-[#0A264A] hover:underline"
                      >
                        Open Infrastructure Console →
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {data.infrastructure.components.map((c) => (
                      <div
                        key={c.id}
                        className="bg-white border border-[#E4DDD0] rounded-xl p-4 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {c.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${
                              c.status === 'operational'
                                ? 'bg-emerald-50 text-emerald-800'
                                : c.status === 'degraded'
                                ? 'bg-rose-50 text-rose-800'
                                : c.status === 'not_configured'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {c.statusLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2">
                          {c.metrics[0]?.label}: <strong className="text-slate-700">{c.metrics[0]?.value}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-[#E4DDD0] rounded-xl p-6">
                  <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                    Traffic &amp; Referral Attribution
                  </h2>
                  {data.analytics.trafficSources.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No referral events recorded yet. Visits from Pinterest, Google, and UTM links appear here.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b border-[#E4DDD0]">
                          <th className="pb-2">Source</th>
                          <th className="pb-2 text-right">Events</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.analytics.trafficSources.map((s) => (
                          <tr key={s.source}>
                            <td className="py-2 font-medium text-slate-800">{s.source}</td>
                            <td className="py-2 text-right font-mono tabular-nums">
                              {s.count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-white border border-[#E4DDD0] rounded-xl p-6">
                  <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                    Product Engagement vs Outbound Selar Clicks
                  </h2>
                  {data.analytics.perProduct.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No product engagement recorded yet.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b border-[#E4DDD0]">
                          <th className="pb-2">Product Slug</th>
                          <th className="pb-2 text-right">Views</th>
                          <th className="pb-2 text-right">Selar Clicks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.analytics.perProduct.map((p) => (
                          <tr key={p.slug}>
                            <td className="py-2 font-mono text-xs text-slate-800">
                              {p.slug}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums">
                              {p.views}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums text-[#0A264A]">
                              {p.selarClicks}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'customers' && (
            <AdminCustomersTab
              customers={data.customers}
              availableRoles={data.availableRoles || []}
              hasPermission={hasAdminPermission}
              getAuthHeaders={getAuthHeaders}
              onToast={showToast}
              onRefresh={loadAdminData}
              onRequireReauth={(fn) => setReauthPendingAction(() => fn)}
            />
          )}

          {tab === 'support' && (
            <AdminSupportTab
              supportCases={data.supportCases || []}
              enquiries={data.enquiries || []}
              subscribers={data.subscribers || []}
              products={data.products || []}
              hasPermission={hasAdminPermission}
              getAuthHeaders={getAuthHeaders}
              onToast={showToast}
              onRefresh={loadAdminData}
              onRequireReauth={(fn) => setReauthPendingAction(() => fn)}
            />
          )}

          {/* TAB 2: PRODUCT MANAGEMENT */}
          {tab === 'products' && (
            <div className="space-y-6">
              {editingProduct && (
                <form
                  onSubmit={handleSaveProduct}
                  className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-[#E4DDD0] pb-4">
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      {editingProduct.id ? `Edit ${editingProduct.name}` : 'New Digital Product'}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEditingProduct(null)}
                      className="text-xs text-slate-500 hover:text-slate-900"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Product Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editingProduct.name || ''}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, name: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        URL Slug
                      </label>
                      <input
                        type="text"
                        required
                        value={editingProduct.slug || ''}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, slug: e.target.value })
                        }
                        placeholder="life-reset"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Department
                      </label>
                      <select
                        value={editingProduct.categoryId || ''}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            categoryId: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="">Uncategorised</option>
                        {data.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Selar External Checkout URL (Stage 1)
                      </label>
                      <input
                        type="url"
                        value={editingProduct.marketplaceUrl || ''}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            marketplaceUrl: e.target.value,
                          })
                        }
                        placeholder="https://selar.com/..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Price (NGN ₦)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={ngnInput}
                          onChange={(e) => setNgnInput(e.target.value)}
                          placeholder="e.g. 5000"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Compare-at NGN
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={origNgnInput}
                          onChange={(e) => setOrigNgnInput(e.target.value)}
                          placeholder="Strike-through"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Price (USD $)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={usdInput}
                          onChange={(e) => setUsdInput(e.target.value)}
                          placeholder="e.g. 9.99"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Compare-at USD
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={origUsdInput}
                          onChange={(e) => setOrigUsdInput(e.target.value)}
                          placeholder="Strike-through"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        File Format
                      </label>
                      <select
                        value={editingProduct.fileFormat || 'PDF'}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            fileFormat: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="PDF">PDF</option>
                        <option value="XLSX">XLSX</option>
                        <option value="XLS">XLS</option>
                        <option value="CSV">CSV</option>
                        <option value="DOCX">DOCX</option>
                        <option value="PPTX">PPTX</option>
                        <option value="ZIP">ZIP</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Version
                      </label>
                      <input
                        type="text"
                        value={editingProduct.version || '1.0'}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            version: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Display Order
                      </label>
                      <input
                        type="number"
                        value={editingProduct.sortOrder ?? 0}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            sortOrder: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Publication Status
                      </label>
                      <select
                        value={editingProduct.status || 'published'}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            status: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Short Benefit Statement
                    </label>
                    <input
                      type="text"
                      required
                      value={editingProduct.shortBenefit || ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          shortBenefit: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Product Description
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={editingProduct.fullDescription || ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          fullDescription: e.target.value,
                          shortDescription:
                            editingProduct.shortDescription ||
                            e.target.value.slice(0, 180),
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        What Is Included (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={contentsText}
                        onChange={(e) => setContentsText(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Key Benefits (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={benefitsText}
                        onChange={(e) => setBenefitsText(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Intended Audience (one per line)
                      </label>
                      <textarea
                        rows={3}
                        value={audienceText}
                        onChange={(e) => setAudienceText(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#E4DDD0]">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Cover Image URL or Upload
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingProduct.coverImage || ''}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              coverImage: e.target.value,
                            })
                          }
                          className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                        <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{uploadingImage ? 'Uploading...' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleCoverUpload(f);
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {editingProduct.id && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Protected Downloadable Asset (Native Fulfilment / Free Resource)
                        </label>
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingProtected
                                ? 'Uploading...'
                                : 'Upload Protected File'}
                            </span>
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f && editingProduct.id) {
                                  handleProtectedFileUpload(editingProduct.id, f);
                                }
                              }}
                            />
                          </label>
                          <span className="text-xs text-slate-500">
                            {editingProduct.fileSize || 'No binary uploaded yet'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Instructions, Requirements, Licence & SEO */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#E4DDD0]">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Delivery / Usage Instructions
                      </label>
                      <textarea
                        rows={2}
                        value={editingProduct.instructions || ''}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            instructions: e.target.value,
                          })
                        }
                        placeholder="How customers access and use this resource..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Software / Device Requirements
                      </label>
                      <textarea
                        rows={2}
                        value={editingProduct.requirements || ''}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            requirements: e.target.value,
                          })
                        }
                        placeholder="e.g. Standard PDF reader, Excel, or tablet annotation app"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Product Licence Terms
                      </label>
                      <input
                        type="text"
                        value={editingProduct.licenceType || ''}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            licenceType: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          SEO Title
                        </label>
                        <input
                          type="text"
                          value={editingProduct.seoTitle || ''}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              seoTitle: e.target.value,
                            })
                          }
                          placeholder="Custom search engine title (optional)"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          SEO Meta Description
                        </label>
                        <input
                          type="text"
                          value={editingProduct.seoDescription || ''}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              seoDescription: e.target.value,
                            })
                          }
                          placeholder="Concise search summary (optional)"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Product FAQs Editor */}
                  <div className="pt-2 border-t border-[#E4DDD0] space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">
                        Frequently Asked Questions ({faqsDraft.length})
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setFaqsDraft([...faqsDraft, { question: '', answer: '' }])
                        }
                        className="px-3 py-1 text-xs font-semibold text-[#0A264A] bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        + Add FAQ
                      </button>
                    </div>
                    {faqsDraft.map((faq, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-slate-50 p-3 rounded-lg border border-slate-200"
                      >
                        <input
                          type="text"
                          placeholder="Question"
                          value={faq.question}
                          onChange={(e) => {
                            const next = [...faqsDraft];
                            next[idx] = { ...next[idx], question: e.target.value };
                            setFaqsDraft(next);
                          }}
                          className="md:col-span-5 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                        />
                        <input
                          type="text"
                          placeholder="Answer"
                          value={faq.answer}
                          onChange={(e) => {
                            const next = [...faqsDraft];
                            next[idx] = { ...next[idx], answer: e.target.value };
                            setFaqsDraft(next);
                          }}
                          className="md:col-span-6 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFaqsDraft(faqsDraft.filter((_, i) => i !== idx))
                          }
                          aria-label="Remove FAQ"
                          className="md:col-span-1 p-1.5 text-slate-400 hover:text-rose-600 justify-self-end"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Related Products & Contextual Software Companion */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#E4DDD0]">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Explicit Related Products (Optional Cross-Sell)
                      </label>
                      <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-3 space-y-1.5 bg-slate-50">
                        {data.products
                          .filter((other) => other.id !== editingProduct.id)
                          .map((other) => {
                            const selected = (
                              editingProduct.relatedProductIds || []
                            ).includes(other.id);
                            return (
                              <label
                                key={other.id}
                                className="flex items-center gap-2 text-xs text-slate-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(e) => {
                                    const prevIds =
                                      editingProduct.relatedProductIds || [];
                                    setEditingProduct({
                                      ...editingProduct,
                                      relatedProductIds: e.target.checked
                                        ? [...prevIds, other.id]
                                        : prevIds.filter((id) => id !== other.id),
                                    });
                                  }}
                                />
                                <span>{other.name}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Contextual Software Companion (Optional PDP Card)
                      </label>
                      <select
                        value=""
                        onChange={(e) => {
                          const picked = (data.ecosystemPlatforms || []).find(
                            (pl) => String(pl.id) === e.target.value
                          );
                          if (!picked) return;
                          setEditingProduct({
                            ...editingProduct,
                            ecosystemName: picked.name,
                            ecosystemUrl: picked.destinationUrl || '',
                            ecosystemPitch: picked.description,
                          });
                        }}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="">Quick-fill from Ecosystem Directory...</option>
                        {(data.ecosystemPlatforms || []).map((pl) => (
                          <option key={pl.id} value={pl.id}>
                            {pl.name} {pl.destinationUrl ? '' : '(Destination URL Pending)'}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Companion App Name"
                          value={editingProduct.ecosystemName || ''}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              ecosystemName: e.target.value,
                            })
                          }
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                        />
                        <input
                          type="url"
                          placeholder="Companion URL"
                          value={editingProduct.ecosystemUrl || ''}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              ecosystemUrl: e.target.value,
                            })
                          }
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Short companion note shown on product page"
                        value={editingProduct.ecosystemPitch || ''}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            ecosystemPitch: e.target.value,
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-5 text-xs pt-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.isFeatured)}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            isFeatured: e.target.checked,
                          })
                        }
                      />
                      <span>Featured on Homepage</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.isNewArrival)}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            isNewArrival: e.target.checked,
                          })
                        }
                      />
                      <span>New Arrival</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.isFree)}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            isFree: e.target.checked,
                          })
                        }
                      />
                      <span>Free Resource (Email Unlock)</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.nativeCheckoutEligible)}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            nativeCheckoutEligible: e.target.checked,
                          })
                        }
                      />
                      <span>Eligible for Stage 2 Native Paystack Checkout</span>
                    </label>
                  </div>

                  <div className="pt-4 border-t border-[#E4DDD0] flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingProduct(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingProduct}
                      className="px-5 py-2 text-xs font-semibold text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg disabled:opacity-60"
                    >
                      {savingProduct ? 'Saving...' : 'Save Product'}
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white border border-[#E4DDD0] rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-[#E4DDD0] bg-slate-50">
                      <th className="p-4">Order</th>
                      <th className="p-4">Product</th>
                      <th className="p-4">Format</th>
                      <th className="p-4">NGN / USD</th>
                      <th className="p-4">Selar URL</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.products.map((p) => (
                      <tr key={p.id}>
                        <td className="p-4 font-mono text-xs text-slate-500">
                          #{p.sortOrder ?? 0}
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-slate-900">{p.name}</div>
                          {p.status === 'published' ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/products/${p.slug}`)}
                              className="font-mono text-xs text-[#0A264A] hover:underline"
                            >
                              /products/{p.slug}
                            </button>
                          ) : (
                            <div className="font-mono text-xs text-slate-500">
                              /products/{p.slug}
                            </div>
                          )}
                        </td>
                        <td className="p-4 font-mono text-xs">{p.fileFormat}</td>
                        <td className="p-4 font-mono text-xs tabular-nums">
                          {p.isFree
                            ? 'Free'
                            : `${
                                formatMinorPrice(p.priceNgnKobo, 'NGN') || 'Unset'
                              } / ${
                                formatMinorPrice(p.priceUsdCents, 'USD') || 'Unset'
                              }`}
                        </td>
                        <td className="p-4 text-xs">
                          {p.marketplaceUrl ? (
                            <span className="text-emerald-700 font-medium">Configured</span>
                          ) : (
                            <span className="text-amber-700 font-medium">Pending URL</span>
                          )}
                        </td>
                        <td className="p-4 text-xs uppercase font-medium text-slate-700">
                          {p.status}
                        </td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={togglingProductId === p.id}
                            onClick={() => handleTogglePublish(p)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md disabled:opacity-60"
                          >
                            {togglingProductId === p.id
                              ? 'Updating...'
                              : p.status === 'published'
                              ? 'Unpublish'
                              : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openProductEditor(p)}
                            className="px-3 py-1.5 text-xs font-semibold text-[#0A264A] bg-slate-100 hover:bg-slate-200 rounded-md"
                          >
                            Edit
                          </button>
                          {confirmDeleteId === p.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md"
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600"
                              aria-label={`Delete ${p.name}`}
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: CATEGORIES & COLLECTIONS */}
          {tab === 'categories' && (
            <div className="space-y-8">
              <div className="space-y-6">
                {editingCategory && (
                  <form
                    onSubmit={handleSaveCategory}
                    className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4"
                  >
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      {editingCategory.id ? `Edit ${editingCategory.name}` : 'New Department'}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input
                        type="text"
                        required
                        placeholder="Department Name"
                        value={editingCategory.name || ''}
                        onChange={(e) =>
                          setEditingCategory({ ...editingCategory, name: e.target.value })
                        }
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="URL Slug"
                        value={editingCategory.slug || ''}
                        onChange={(e) =>
                          setEditingCategory({ ...editingCategory, slug: e.target.value })
                        }
                        className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                      <input
                        type="number"
                        placeholder="Sort Order"
                        value={editingCategory.sortOrder ?? 0}
                        onChange={(e) =>
                          setEditingCategory({
                            ...editingCategory,
                            sortOrder: Number(e.target.value),
                          })
                        }
                        className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Department description"
                      value={editingCategory.description || ''}
                      onChange={(e) =>
                        setEditingCategory({
                          ...editingCategory,
                          description: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input
                        type="text"
                        placeholder="Subtopics (comma-separated)"
                        value={subtopicsInput}
                        onChange={(e) => setSubtopicsInput(e.target.value)}
                        className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="Department Image Path / URL"
                        value={editingCategory.imageUrl || ''}
                        onChange={(e) =>
                          setEditingCategory({
                            ...editingCategory,
                            imageUrl: e.target.value,
                          })
                        }
                        className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Companion App"
                          value={editingCategory.ecosystemApp || ''}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              ecosystemApp: e.target.value,
                            })
                          }
                          className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                        <input
                          type="url"
                          placeholder="Companion URL"
                          value={editingCategory.ecosystemUrl || ''}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              ecosystemUrl: e.target.value,
                            })
                          }
                          className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={editingCategory.isActive !== false}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              isActive: e.target.checked,
                            })
                          }
                        />
                        <span>Active Department</span>
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategory(null);
                            setSubtopicsInput('');
                          }}
                          className="px-4 py-2 text-xs bg-slate-100 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#0A264A] rounded-lg"
                        >
                          Save Department
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Store Departments ({data.categories.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory({
                        name: '',
                        slug: '',
                        description: '',
                        sortOrder: data.categories.length + 1,
                        isActive: true,
                      });
                      setSubtopicsInput('');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#0A264A] rounded-lg"
                  >
                    Add Department
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.categories.map((c) => (
                    <div
                      key={c.id}
                      className="bg-white border border-[#E4DDD0] rounded-xl p-5 flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-semibold text-slate-900">
                            {c.name}
                          </h3>
                          {!c.isActive && (
                            <span className="text-[10px] font-mono uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                              Hidden
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{c.slug}</p>
                        <p className="text-xs text-slate-600 mt-2">{c.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(c);
                          setSubtopicsInput((c.subtopics || []).join(', '));
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-md shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Curated Collections Management */}
              <div className="pt-6 border-t border-[#E4DDD0] space-y-4">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Curated Collections ({data.collections.length})
                </h2>

                {editingCollection && (
                  <form
                    onSubmit={handleSaveCollection}
                    className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4"
                  >
                    <h3 className="font-display text-base font-bold text-slate-900">
                      Edit Collection: {editingCollection.title}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        type="text"
                        required
                        value={editingCollection.title}
                        onChange={(e) =>
                          setEditingCollection({
                            ...editingCollection,
                            title: e.target.value,
                          })
                        }
                        placeholder="Collection Title"
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                      <input
                        type="text"
                        required
                        value={editingCollection.subtitle}
                        onChange={(e) =>
                          setEditingCollection({
                            ...editingCollection,
                            subtitle: e.target.value,
                          })
                        }
                        placeholder="Collection Subtitle"
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-700">Assigned Products:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {data.products.map((p) => {
                          const selected = (editingCollection.productIds || []).includes(p.id);
                          return (
                            <label key={p.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                  const prevIds = editingCollection.productIds || [];
                                  setEditingCollection({
                                    ...editingCollection,
                                    productIds: e.target.checked
                                      ? [...prevIds, p.id]
                                      : prevIds.filter((id) => id !== p.id),
                                  });
                                }}
                              />
                              <span>{p.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={editingCollection.isActive}
                          onChange={(e) =>
                            setEditingCollection({
                              ...editingCollection,
                              isActive: e.target.checked,
                            })
                          }
                        />
                        <span>Active Collection</span>
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCollection(null)}
                          className="px-4 py-2 text-xs bg-slate-100 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#0A264A] rounded-lg"
                        >
                          Save Collection
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.collections.map((col) => (
                    <div
                      key={col.id}
                      className="bg-white border border-[#E4DDD0] rounded-xl p-5 flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-semibold text-slate-900">
                            {col.title}
                          </h3>
                          <span className="text-[10px] font-mono text-slate-500">
                            ({(col.productIds || []).length} items)
                          </span>
                          {!col.isActive && (
                            <span className="text-[10px] font-mono uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{col.subtitle}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingCollection({ ...col })}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-md shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BUNDLES */}
          {tab === 'bundles' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleSaveBundle}
                className="lg:col-span-5 bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4 h-fit"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    {editingBundleId ? 'Edit Digital Bundle' : 'Create Digital Bundle'}
                  </h2>
                  {editingBundleId && (
                    <button
                      type="button"
                      onClick={resetBundleForm}
                      className="text-xs text-slate-500 hover:text-slate-900"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="Bundle Name (e.g. Personal Development Bundle)"
                  value={newBundle.name}
                  onChange={(e) => setNewBundle({ ...newBundle, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="URL Slug (optional)"
                  value={newBundle.slug}
                  onChange={(e) => setNewBundle({ ...newBundle, slug: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
                <textarea
                  rows={3}
                  required
                  placeholder="Bundle description"
                  value={newBundle.description}
                  onChange={(e) =>
                    setNewBundle({ ...newBundle, description: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    placeholder="Price NGN"
                    value={newBundle.priceNgn}
                    onChange={(e) =>
                      setNewBundle({ ...newBundle, priceNgn: e.target.value })
                    }
                    className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Price USD"
                    value={newBundle.priceUsd}
                    onChange={(e) =>
                      setNewBundle({ ...newBundle, priceUsd: e.target.value })
                    }
                    className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <input
                  type="url"
                  placeholder="Selar Bundle URL (optional)"
                  value={newBundle.marketplaceUrl}
                  onChange={(e) =>
                    setNewBundle({ ...newBundle, marketplaceUrl: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-3 items-center">
                  <select
                    value={newBundle.status}
                    onChange={(e) => setNewBundle({ ...newBundle, status: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={newBundle.isFeatured}
                      onChange={(e) =>
                        setNewBundle({ ...newBundle, isFeatured: e.target.checked })
                      }
                    />
                    <span>Featured</span>
                  </label>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-700">Include Products:</p>
                  {data.products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={newBundle.productIds.includes(p.id)}
                        onChange={(e) => {
                          setNewBundle((prev) => ({
                            ...prev,
                            productIds: e.target.checked
                              ? [...prev.productIds, p.id]
                              : prev.productIds.filter((id) => id !== p.id),
                          }));
                        }}
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-semibold text-white bg-[#0A264A] rounded-lg"
                >
                  {editingBundleId ? 'Update Bundle' : 'Publish Bundle'}
                </button>
              </form>

              <div className="lg:col-span-7 space-y-4">
                {data.bundles.length === 0 ? (
                  <div className="bg-white border border-[#E4DDD0] rounded-xl p-6 text-sm text-slate-600">
                    No bundles published yet. Create one on the left to group related digital products.
                  </div>
                ) : (
                  data.bundles.map((b) => (
                    <div
                      key={b.id}
                      className="bg-white border border-[#E4DDD0] rounded-xl p-5 flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-semibold text-slate-900">
                            {b.name}
                          </h3>
                          <span className="text-[10px] font-mono uppercase text-slate-500">
                            {b.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{b.description}</p>
                        <p className="font-mono text-xs text-slate-500 mt-2">
                          {formatMinorPrice(b.priceNgnKobo, 'NGN') || 'NGN Unset'} ·{' '}
                          {formatMinorPrice(b.priceUsdCents, 'USD') || 'USD Unset'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBundleId(b.id);
                            setNewBundle({
                              name: b.name,
                              slug: b.slug,
                              description: b.description,
                              priceNgn:
                                b.priceNgnKobo !== null ? String(b.priceNgnKobo / 100) : '',
                              priceUsd:
                                b.priceUsdCents !== null ? String(b.priceUsdCents / 100) : '',
                              marketplaceUrl: b.marketplaceUrl || '',
                              status: b.status || 'published',
                              isFeatured: Boolean(b.isFeatured),
                              productIds: b.productIds || [],
                            });
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-[#0A264A] rounded-md"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const headers = await getAuthHeaders();
                            await fetch(`/api/admin/bundles/${b.id}`, {
                              method: 'DELETE',
                              headers,
                            });
                            if (editingBundleId === b.id) resetBundleForm();
                            loadAdminData();
                            refreshStorefront();
                          }}
                          aria-label={`Delete ${b.name}`}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4B: ECOSYSTEM PLATFORMS DIRECTORY */}
          {tab === 'ecosystem' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Jeneconk Digital Ecosystem Directory ({data.ecosystemPlatforms?.length || 0})
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Manage software platforms and institutional solutions displayed in the secondary storefront directory and /ecosystem page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openPlatformEditor()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Platform</span>
                </button>
              </div>

              {(data.ecosystemPlatforms || []).some((pl) => !pl.destinationUrl) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
                  <span className="font-semibold">Pending Destination URLs:</span>{' '}
                  {(data.ecosystemPlatforms || [])
                    .filter((pl) => !pl.destinationUrl)
                    .map((pl) => pl.name)
                    .join(', ')}{' '}
                  currently route customers to the Store Enquiry Form instead of an unverified subdomain. Add a verified URL below whenever ready.
                </div>
              )}

              {editingPlatform && (
                <form
                  onSubmit={handleSavePlatform}
                  className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-[#E4DDD0] pb-3">
                    <h3 className="font-display text-base font-bold text-slate-900">
                      {editingPlatform.id ? `Edit ${editingPlatform.name}` : 'New Ecosystem Platform'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingPlatform(null)}
                      className="text-xs text-slate-500 hover:text-slate-900"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Platform Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editingPlatform.name || ''}
                        onChange={(e) =>
                          setEditingPlatform({ ...editingPlatform, name: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        URL Slug
                      </label>
                      <input
                        type="text"
                        value={editingPlatform.slug || ''}
                        onChange={(e) =>
                          setEditingPlatform({ ...editingPlatform, slug: e.target.value })
                        }
                        placeholder="auto-generated if blank"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Sector / Group
                      </label>
                      <input
                        type="text"
                        required
                        value={editingPlatform.category || ''}
                        onChange={(e) =>
                          setEditingPlatform({ ...editingPlatform, category: e.target.value })
                        }
                        placeholder="Education & Learning"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Destination URL (Leave blank if enquiry-only)
                      </label>
                      <input
                        type="url"
                        value={editingPlatform.destinationUrl || ''}
                        onChange={(e) =>
                          setEditingPlatform({
                            ...editingPlatform,
                            destinationUrl: e.target.value,
                          })
                        }
                        placeholder="https://edu.jeneconk.com"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Linked Store Department (For Product-Page Suggestions)
                      </label>
                      <select
                        value={editingPlatform.relatedCategorySlug || ''}
                        onChange={(e) =>
                          setEditingPlatform({
                            ...editingPlatform,
                            relatedCategorySlug: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="">General / Unlinked</option>
                        {data.categories.map((c) => (
                          <option key={c.id} value={c.slug}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Concise Description
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={editingPlatform.description || ''}
                      onChange={(e) =>
                        setEditingPlatform({
                          ...editingPlatform,
                          description: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Fallback Vector Icon
                      </label>
                      <select
                        value={editingPlatform.iconName || 'Layers'}
                        onChange={(e) =>
                          setEditingPlatform({
                            ...editingPlatform,
                            iconName: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="GraduationCap">GraduationCap</option>
                        <option value="BrainCircuit">BrainCircuit</option>
                        <option value="BookOpenCheck">BookOpenCheck</option>
                        <option value="MonitorCheck">MonitorCheck</option>
                        <option value="BriefcaseBusiness">BriefcaseBusiness</option>
                        <option value="Wallet">Wallet</option>
                        <option value="ClipboardCheck">ClipboardCheck</option>
                        <option value="Megaphone">Megaphone</option>
                        <option value="Sparkles">Sparkles</option>
                        <option value="Layers">Layers</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Custom Logo URL or Upload (Optional)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingPlatform.logoUrl || ''}
                          onChange={(e) =>
                            setEditingPlatform({
                              ...editingPlatform,
                              logoUrl: e.target.value,
                            })
                          }
                          placeholder="/uploads/..."
                          className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                        <label className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{uploadingPlatformLogo ? 'Uploading...' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handlePlatformLogoUpload(f);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Sort Order
                        </label>
                        <input
                          type="number"
                          value={editingPlatform.sortOrder ?? 0}
                          onChange={(e) =>
                            setEditingPlatform({
                              ...editingPlatform,
                              sortOrder: Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Status
                        </label>
                        <select
                          value={editingPlatform.status || 'published'}
                          onChange={(e) =>
                            setEditingPlatform({
                              ...editingPlatform,
                              status: e.target.value,
                            })
                          }
                          className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg"
                        >
                          <option value="published">Published</option>
                          <option value="draft">Draft</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={editingPlatform.isFeatured !== false}
                        onChange={(e) =>
                          setEditingPlatform({
                            ...editingPlatform,
                            isFeatured: e.target.checked,
                          })
                        }
                      />
                      <span>Feature on Homepage Ecosystem Section</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPlatform(null)}
                        className="px-4 py-2 text-xs bg-slate-100 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingPlatform}
                        className="px-4 py-2 text-xs font-semibold text-white bg-[#0A264A] rounded-lg disabled:opacity-60"
                      >
                        {savingPlatform ? 'Saving...' : 'Save Platform'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="bg-white border border-[#E4DDD0] rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-[#E4DDD0] bg-slate-50">
                      <th className="p-4">Order</th>
                      <th className="p-4">Platform</th>
                      <th className="p-4">Sector</th>
                      <th className="p-4">Destination</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.ecosystemPlatforms || []).map((pl) => (
                      <tr key={pl.id}>
                        <td className="p-4 font-mono text-xs text-slate-500">
                          #{pl.sortOrder}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#FAF8F4] border border-[#E4DDD0] flex items-center justify-center text-[#0A264A] shrink-0">
                              <EcosystemIcon
                                iconName={pl.iconName}
                                logoUrl={pl.logoUrl}
                                name={pl.name}
                                className="w-4 h-4"
                              />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">{pl.name}</div>
                              <div className="font-mono text-xs text-slate-500">{pl.slug}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-xs text-slate-700">{pl.category}</td>
                        <td className="p-4 text-xs">
                          {pl.destinationUrl ? (
                            <a
                              href={pl.destinationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 font-medium hover:underline"
                            >
                              {pl.destinationUrl}
                            </a>
                          ) : (
                            <span className="text-amber-700 font-medium">
                              Pending URL (Enquiry Fallback)
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-xs uppercase font-medium text-slate-700">
                          {pl.status}
                        </td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleTogglePlatformStatus(pl)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                          >
                            {pl.status === 'published' ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openPlatformEditor(pl)}
                            className="px-3 py-1.5 text-xs font-semibold text-[#0A264A] bg-slate-100 hover:bg-slate-200 rounded-md"
                          >
                            Edit
                          </button>
                          {confirmDeletePlatformId === pl.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeletePlatform(pl.id, pl.name)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-md"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePlatformId(null)}
                                className="px-2 py-1.5 text-xs text-slate-600"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePlatformId(pl.id)}
                              aria-label={`Delete ${pl.name}`}
                              className="p-1.5 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: ORDERS & TRANSACTIONS */}
          {tab === 'orders' && (
            <AdminOrdersTab
              orders={data.orders || []}
              nativeCheckoutActive={Boolean(
                data.integrationStatus?.paystack.nativeCheckoutActive
              )}
              hasPermission={hasAdminPermission}
              getAuthHeaders={getAuthHeaders}
              onToast={showToast}
              onRefresh={loadAdminData}
              onExportCsv={handleExportOrdersCsv}
              onRequireReauth={(fn) => setReauthPendingAction(() => fn)}
            />
          )}

          {/* TAB 6: PROMOTIONS & DISCOUNT CODES */}
          {tab === 'marketing' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleCreateDiscount}
                className="lg:col-span-5 bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4 h-fit"
              >
                <h2 className="font-display text-base font-bold text-slate-900">
                  Create Discount Code
                </h2>
                <input
                  type="text"
                  required
                  placeholder="CODE (e.g. LAUNCH20)"
                  value={newDiscount.code}
                  onChange={(e) =>
                    setNewDiscount({ ...newDiscount, code: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newDiscount.discountType}
                    onChange={(e) =>
                      setNewDiscount({ ...newDiscount, discountType: e.target.value })
                    }
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed_ngn">Fixed NGN (₦)</option>
                    <option value="fixed_usd">Fixed USD ($)</option>
                  </select>
                  <input
                    type="number"
                    required
                    value={newDiscount.value}
                    onChange={(e) =>
                      setNewDiscount({ ...newDiscount, value: e.target.value })
                    }
                    className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  placeholder="Max Uses (optional)"
                  value={newDiscount.maxUses}
                  onChange={(e) =>
                    setNewDiscount({ ...newDiscount, maxUses: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-semibold text-white bg-[#0A264A] rounded-lg"
                >
                  Save Discount Code
                </button>
              </form>

              <div className="lg:col-span-7 bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-3">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Active &amp; Past Codes ({data.discounts.length})
                </h3>
                {data.discounts.length === 0 ? (
                  <p className="text-xs text-slate-500">No discount codes created yet.</p>
                ) : (
                  data.discounts.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 text-xs border-b border-slate-100 pb-2"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-900">
                          {d.code}
                        </span>
                        <span className="ml-2 text-slate-600">
                          {d.value} ({d.discountType}) · Used {d.usedCount}
                          {d.maxUses ? `/${d.maxUses}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleDiscount(d.id, d.isActive)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                          d.isActive
                            ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {d.isActive ? 'Active (Pause)' : 'Paused (Activate)'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'infrastructure' && data.infrastructure && (
            <AdminInfraTab
              infrastructure={data.infrastructure}
              hasPermission={hasAdminPermission}
              getAuthHeaders={getAuthHeaders}
              onToast={showToast}
              onRefresh={loadAdminData}
            />
          )}

          {tab === 'email' && data.emailStatus && (
            <AdminEmailTab
              emailStatus={data.emailStatus}
              emailLogs={data.emailLogs || []}
              canManageSettings={hasAdminPermission('manage_settings')}
              getAuthHeaders={getAuthHeaders}
              onToast={showToast}
              onRefresh={loadAdminData}
            />
          )}

          {tab === 'reports' && (
            <AdminReportsTab
              products={data.products || []}
              analytics={data.analytics}
              canExport={hasAdminPermission('export_reports')}
              getAuthHeaders={getAuthHeaders}
              onToast={showToast}
            />
          )}

          {/* TAB 7: SETTINGS & AUDIT LOGS */}
          {tab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleSaveSettings}
                className="lg:col-span-6 bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Store &amp; Checkout Configuration
                </h2>

                <div className="p-4 bg-[#FAF8F4] border border-[#E4DDD0] rounded-lg space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Stage 2 Native Paystack Checkout
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Initial purchases use external Selar checkout links. Native checkout stays
                        disabled until both this toggle and genuine Paystack server credentials are
                        supplied.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label="Enable Stage 2 Native Paystack Checkout"
                      checked={settingsForm.native_checkout_enabled === 'true'}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          native_checkout_enabled: e.target.checked ? 'true' : 'false',
                        })
                      }
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#E4DDD0] text-xs">
                    <div className="bg-white border border-[#E4DDD0] rounded-md px-3 py-2">
                      <span className="text-slate-500 block">PAYSTACK_SECRET_KEY</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {data.integrationStatus?.paystack.testKeyBlockedInProduction
                          ? 'Test key blocked on production service'
                          : data.integrationStatus?.paystack.secretKeyConfigured
                          ? 'Configured'
                          : 'Disabled (Unset or Placeholder)'}
                      </span>
                    </div>
                    <div className="bg-white border border-[#E4DDD0] rounded-md px-3 py-2">
                      <span className="text-slate-500 block">Paystack webhook signature</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {data.integrationStatus?.paystack.webhookSecretConfigured
                          ? 'Dedicated signing secret configured'
                          : data.integrationStatus?.paystack.webhookVerificationConfigured
                          ? 'Legacy secret-key signature fallback'
                          : 'Not configured'}
                      </span>
                    </div>
                    <div className="bg-white border border-[#E4DDD0] rounded-md px-3 py-2">
                      <span className="text-slate-500 block">PAYSTACK_PUBLIC_KEY</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {data.integrationStatus?.paystack.publicKeyConfigured
                          ? 'Configured'
                          : 'Disabled (Unset or Placeholder)'}
                      </span>
                    </div>
                    <div className="bg-white border border-[#E4DDD0] rounded-md px-3 py-2">
                      <span className="text-slate-500 block">Effective Checkout Mode</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {data.integrationStatus?.paystack.nativeCheckoutActive
                          ? 'Native Paystack Active'
                          : 'External Selar Only'}
                      </span>
                    </div>
                    <div className="bg-white border border-[#E4DDD0] rounded-md px-3 py-2 sm:col-span-2">
                      <span className="text-slate-500 block">DOWNLOAD_SIGNING_SECRET</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {data.integrationStatus?.downloadSigning?.configured
                          ? 'Configured'
                          : 'Ephemeral Dev Only (Set Secret Before Production Stage 2)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Promotional Announcement Banner
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={settingsForm.promo_banner_enabled === 'true'}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            promo_banner_enabled: e.target.checked ? 'true' : 'false',
                          })
                        }
                      />
                      <input
                        type="text"
                        value={settingsForm.promo_banner_text || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            promo_banner_text: e.target.value,
                          })
                        }
                        placeholder="Optional slim top announcement text"
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Homepage Hero Eyebrow Kicker
                    </label>
                    <input
                      type="text"
                      value={settingsForm.hero_kicker || ''}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          hero_kicker: e.target.value,
                        })
                      }
                      placeholder="Jeneconk Digital Store"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 p-3 bg-[#FAF8F4] border border-[#E4DDD0] rounded-lg">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Free Resources Promo Headline
                      </label>
                      <input
                        type="text"
                        value={settingsForm.free_promo_headline || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            free_promo_headline: e.target.value,
                          })
                        }
                        placeholder="Free Practical Templates & Mini Guides"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Free Resources Promo Subtext
                      </label>
                      <textarea
                        rows={2}
                        value={settingsForm.free_promo_subtext || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            free_promo_subtext: e.target.value,
                          })
                        }
                        placeholder="Download complimentary starter resources or subscribe for new workbook releases..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Customer Support Email
                      </label>
                      <input
                        type="email"
                        value={settingsForm.support_email || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            support_email: e.target.value,
                          })
                        }
                        placeholder="info@jeneconk.com"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Business &amp; Partnerships Email
                      </label>
                      <input
                        type="email"
                        value={settingsForm.business_email || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            business_email: e.target.value,
                          })
                        }
                        placeholder="business@jeneconk.com"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      WhatsApp Support Number (International format, e.g. 23480...)
                    </label>
                    <input
                      type="text"
                      value={settingsForm.whatsapp_number || ''}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          whatsapp_number: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Pinterest Tag ID (Numeric, e.g. 2612...)
                      </label>
                      <input
                        type="text"
                        value={settingsForm.pinterest_tag_id || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            pinterest_tag_id: e.target.value,
                          })
                        }
                        placeholder="Leave blank or set PINTEREST_TAG_ID env"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Tracking status:{' '}
                        <span className="font-mono font-semibold text-slate-700">
                          {data.integrationStatus?.pinterest.configured
                            ? `Active (${data.integrationStatus.pinterest.source})`
                            : 'Disabled (Unset or Placeholder)'}
                        </span>
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Google Analytics ID (e.g. G-XXXXXXXXXX)
                      </label>
                      <input
                        type="text"
                        value={settingsForm.ga_measurement_id || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            ga_measurement_id: e.target.value,
                          })
                        }
                        placeholder="Leave blank or set GA_MEASUREMENT_ID env"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Tracking status:{' '}
                        <span className="font-mono font-semibold text-slate-700">
                          {data.integrationStatus?.googleAnalytics.configured
                            ? 'Active'
                            : 'Disabled (Unset or Placeholder)'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg disabled:opacity-60"
                >
                  {savingSettings ? 'Saving...' : 'Save Store Settings'}
                </button>
              </form>

              <div className="lg:col-span-6 bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Admin Audit Trail
                </h2>
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto text-xs">
                  {data.auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="border-b border-slate-100 pb-2 flex items-start justify-between gap-3"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-900">
                          {log.action}
                        </span>
                        {log.result && log.result !== 'success' && (
                          <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-mono uppercase rounded bg-rose-100 text-rose-800">
                            {log.result}
                          </span>
                        )}
                        <p className="text-slate-600 mt-0.5">{log.details}</p>
                        {log.reason && (
                          <p className="text-slate-500 italic mt-0.5">Reason: {log.reason}</p>
                        )}
                        <p className="text-slate-400 mt-0.5">{log.adminEmail}</p>
                      </div>
                      <span className="text-slate-400 shrink-0 font-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: GUIDES & CHECKLISTS */}
          {tab === 'guides' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700">
              <div className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Administrator &amp; Product Upload Guide
                </h2>
                <ol className="list-decimal pl-5 space-y-2 text-xs leading-relaxed">
                  <li>Open the Products tab and click Edit next to Life Reset or Christmas Planner.</li>
                  <li>Paste the verified Selar product URL into Selar External Checkout URL and enter NGN and USD prices.</li>
                  <li>Upload custom vertical (3:4) cover images for optimal Pinterest Rich Pin presentation.</li>
                  <li>For native or free downloads, upload the master digital file under Protected Downloadable Asset (stored outside public web directories).</li>
                </ol>
              </div>

              <div className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Native Paystack Setup
                </h2>
                <ol className="list-decimal pl-5 space-y-2 text-xs leading-relaxed">
                  <li>Store the Paystack test secret key, current webhook signing secret, and download signing secret in the server's secret store. The public key is not a secret.</li>
                  <li>Point the Paystack Dashboard webhook to https://digital.jeneconk.com/api/webhooks/paystack.</li>
                  <li>Upload and verify the protected master file for each product to be sold through native Paystack. Selar-delivered products do not need an app copy unless you also enable native sales.</li>
                  <li>Enable Native Paystack Checkout under Settings and mark only products with verified protected files as eligible.</li>
                  <li>Transactions are verified server-side against Paystack status, amount, and currency; signed webhooks are validated before issuing 15-minute download links.</li>
                </ol>
              </div>

              <div className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Security Checklist
                </h2>
                <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed">
                  <li>Firebase ID tokens verified server-side on all customer and admin routes.</li>
                  <li>Protected digital product files stored outside public static serving and delivered via HMAC-SHA256 expiring links.</li>
                  <li>Rate limiting enforced on analytics, newsletter, support, checkout, and admin endpoints.</li>
                  <li>Audit logging enabled for all product, category, order, role, and settings changes.</li>
                </ul>
              </div>

              <div className="bg-white border border-[#E4DDD0] rounded-xl p-6 space-y-3">
                <h2 className="font-display text-base font-bold text-slate-900">
                  SEO &amp; Pinterest Checklist
                </h2>
                <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed">
                  <li>Dynamic XML sitemap served at /sitemap.xml and robots policy at /robots.txt.</li>
                  <li>Dedicated SEO slugs (/products/life-reset, /products/christmas-planner) with canonical URLs and Schema.org Product JSON-LD.</li>
                  <li>Vertical 3:4 product covers paired with Open Graph metadata and Pinterest Save button linked to @jeneconkglobal.</li>
                  <li>Outbound Selar clicks tracked separately from confirmed revenue for accurate conversion reporting.</li>
                </ul>
              </div>
            </div>
          )}
        </>
      ) : null}
        </div>
      </div>
    </div>
  );
}
