import React, { useState } from 'react';
import { ArrowUpRight, Mail, MessageSquare } from 'lucide-react';
import { SeoHead } from '../components/SeoHead';
import { useStore } from '../context/StoreContext';

export function AboutPage() {
  const { navigate, ecosystemPlatforms } = useStore();
  return (
    <div className="bg-[#FAF8F4] py-14 sm:py-16">
      <SeoHead
        title="About Jeneconk Digital Store | Jeneconk Integrated Global Solutions"
        description="Learn about Jeneconk Digital Store, operated by Jeneconk Integrated Global Solutions Limited in Port Harcourt, Nigeria."
        path="/about"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="pb-8 border-b border-[#E4DDD0]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
            Corporate Digital Marketplace
          </p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold text-[#171A21]">
            Practical Resources. Smarter Work. Better Living.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#4A505C] leading-relaxed">
            Jeneconk Digital Store is the dedicated digital products marketplace of{' '}
            <strong className="text-[#171A21] font-semibold">
              Jeneconk Integrated Global Solutions Limited
            </strong>
            , headquartered in Port Harcourt, Nigeria.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E4DDD0] rounded-sm p-6 space-y-2.5">
            <h2 className="font-display text-xl font-semibold text-[#171A21]">
              Our Focus
            </h2>
            <p className="text-sm text-[#4A505C] leading-relaxed">
              We create structured PDF planners, financial and operational spreadsheets, teacher toolkits, AI prompt systems, training manuals, and creative templates designed for real-world usefulness across Nigeria and international markets.
            </p>
          </div>
          <div className="bg-white border border-[#E4DDD0] rounded-sm p-6 space-y-2.5">
            <h2 className="font-display text-xl font-semibold text-[#171A21]">
              Parent Company Relationship
            </h2>
            <p className="text-sm text-[#4A505C] leading-relaxed">
              While{' '}
              <a
                href="https://www.jeneconk.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0A264A] hover:underline font-medium"
              >
                www.jeneconk.com
              </a>{' '}
              serves as our corporate hub and software gateway, digital.jeneconk.com focuses exclusively on downloadable products and digital commerce.
            </p>
          </div>
        </div>

        {ecosystemPlatforms.length > 0 && (
          <div className="border-t border-[#E4DDD0] pt-8">
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <h2 className="font-display text-2xl font-semibold text-[#171A21]">
                The Jeneconk Digital Ecosystem
              </h2>
              <button
                type="button"
                onClick={() => navigate('/ecosystem')}
                className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0A264A] hover:text-[#B88329]"
              >
                Full Directory
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ecosystemPlatforms.map((app) =>
                app.destinationUrl ? (
                  <a
                    key={app.id}
                    href={app.destinationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-5 bg-white border border-[#E4DDD0] rounded-sm hover:border-[#0A264A] flex items-start justify-between gap-4 transition-colors"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#B88329] font-medium">
                        {app.category}
                      </p>
                      <h3 className="mt-1 font-display text-base font-semibold text-[#171A21]">
                        {app.name}
                      </h3>
                      <p className="mt-1 text-xs text-[#4A505C] leading-relaxed">
                        {app.description}
                      </p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-[#B88329] shrink-0 mt-1" />
                  </a>
                ) : (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() =>
                      navigate(`/contact?platform=${encodeURIComponent(app.name)}`)
                    }
                    className="text-left p-5 bg-white border border-[#E4DDD0] rounded-sm hover:border-[#0A264A] flex items-start justify-between gap-4 transition-colors"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#B88329] font-medium">
                        {app.category}
                      </p>
                      <h3 className="mt-1 font-display text-base font-semibold text-[#171A21]">
                        {app.name}
                      </h3>
                      <p className="mt-1 text-xs text-[#4A505C] leading-relaxed">
                        {app.description}
                      </p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-[#6D7380] shrink-0 mt-1" />
                  </button>
                )
              )}
            </div>
          </div>
        )}

        <div className="pt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="px-6 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm"
          >
            Browse Digital Store
          </button>
          <button
            type="button"
            onClick={() => navigate('/contact')}
            className="px-6 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#171A21] bg-white border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm"
          >
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContactPage() {
  const { settings, products, firebaseUser, getAuthHeaders, currentPath } = useStore();
  const { initialProduct, initialPlatform } = (() => {
    const idx = currentPath.indexOf('?');
    if (idx === -1) return { initialProduct: '', initialPlatform: '' };
    const params = new URLSearchParams(currentPath.slice(idx));
    return {
      initialProduct: params.get('product') || '',
      initialPlatform: params.get('platform') || '',
    };
  })();
  const [name, setName] = useState(firebaseUser?.displayName || '');
  const [email, setEmail] = useState(firebaseUser?.email || '');
  const [category, setCategory] = useState(
    initialPlatform ? 'business_licensing' : 'general_enquiry'
  );
  const [transactionReference, setTransactionReference] = useState('');
  const [subject, setSubject] = useState(
    initialProduct
      ? `Purchase enquiry: ${initialProduct}`
      : initialPlatform
      ? `Platform enquiry: ${initialPlatform}`
      : ''
  );
  const [productSlug, setProductSlug] = useState(initialProduct);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await fetch('/api/support/enquiry', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          email,
          category,
          transactionReference: transactionReference.trim() || undefined,
          subject,
          productSlug: productSlug || undefined,
          message,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', text: data.error || 'Unable to send message.' });
        return;
      }
      setSubject('');
      setTransactionReference('');
      setMessage('');
      setStatus({ type: 'success', text: data.message });
    } catch {
      setStatus({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const whatsappUrl = settings.whatsappNumber
    ? `https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}`
    : null;

  const supportInbox = settings.supportEmail || 'info@jeneconk.com';
  const businessInbox = settings.businessEmail || 'business@jeneconk.com';

  return (
    <div className="py-14 sm:py-16 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <SeoHead
        title="Contact & Customer Assistance | Jeneconk Digital Store"
        description="Get help with digital downloads, Selar orders, licensing, or bulk institutional enquiries from Jeneconk Integrated Global Solutions Limited."
        path="/contact"
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
              Port Harcourt Support Desk
            </p>
            <h1 className="mt-1.5 font-display text-3xl sm:text-4xl font-semibold text-[#171A21]">
              Customer Assistance
            </h1>
          </div>
          <p className="text-base text-[#4A505C] leading-relaxed">
            Have a question about a planner, template format, Selar order delivery, account access, or institutional team licensing? Submit a tracked support case below.
          </p>

          <div className="bg-white border border-[#E4DDD0] rounded-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-[#0A264A] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#171A21]">
                  Customer Support
                </h2>
                <a
                  href={`mailto:${supportInbox}`}
                  className="text-sm text-[#0A264A] hover:underline"
                >
                  {supportInbox}
                </a>
                <p className="text-xs text-[#6D7380] mt-0.5">
                  Orders, downloads, login &amp; account assistance
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-3 border-t border-[#EDE7DA]">
              <Mail className="w-5 h-5 text-[#B88329] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-base font-semibold text-[#171A21]">
                  Business &amp; Institutional Licensing
                </h2>
                <a
                  href={`mailto:${businessInbox}`}
                  className="text-sm text-[#0A264A] hover:underline"
                >
                  {businessInbox}
                </a>
                <p className="text-xs text-[#6D7380] mt-0.5">
                  Partnerships, school/corporate licences &amp; ecosystem enquiries
                </p>
              </div>
            </div>

            {whatsappUrl && (
              <div className="flex items-start gap-3 pt-3 border-t border-[#EDE7DA]">
                <MessageSquare className="w-5 h-5 text-[#0A264A] shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display text-base font-semibold text-[#171A21]">
                    WhatsApp Support
                  </h2>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-[#0A264A] hover:underline"
                  >
                    <span>Message on WhatsApp</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-[#EDE7DA] text-xs text-[#6D7380]">
              Operated by Jeneconk Integrated Global Solutions Limited · Port Harcourt, Rivers State, Nigeria
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-[#D5CCB9] rounded-sm p-6 sm:p-8 space-y-4"
          >
            <h2 className="font-display text-2xl font-semibold text-[#171A21]">
              Open a Support Case
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Issue Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                >
                  <option value="general_enquiry">General Store Enquiry</option>
                  <option value="paid_no_access">Paid Checkout / Missing Access</option>
                  <option value="broken_download">Broken or Expired Download Link</option>
                  <option value="account_login">Account Login or Registration</option>
                  <option value="email_verification">Email Verification / Password Reset</option>
                  <option value="order_status">Order / Transaction Status</option>
                  <option value="business_licensing">Business &amp; Institutional Licensing</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Order / Transaction Ref (Optional)
                </label>
                <input
                  type="text"
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  placeholder="e.g. JNK-... or Selar receipt ID"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of your request"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A505C] mb-1">
                  Related Product (Optional)
                </label>
                <select
                  value={productSlug}
                  onChange={(e) => setProductSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
                >
                  <option value="">General Store Enquiry</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#4A505C] mb-1">
                Message
              </label>
              <textarea
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your question or issue clearly..."
                className="w-full px-3.5 py-2.5 text-sm bg-[#FAF8F4] border border-[#D5CCB9] rounded-sm"
              />
            </div>

            {status && (
              <p
                className={`text-sm p-3 rounded-sm border ${
                  status.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {status.text}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="px-7 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm disabled:opacity-60 min-h-[44px]"
            >
              {sending ? 'Submitting...' : 'Submit Support Case'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function PolicyPage({
  type,
}: {
  type: 'terms' | 'privacy' | 'refund' | 'licence';
}) {
  const content = {
    terms: {
      title: 'Terms & Conditions',
      path: '/terms',
      sections: [
        {
          h: '1. Operating Entity',
          p: 'Jeneconk Digital Store (digital.jeneconk.com) is operated by Jeneconk Integrated Global Solutions Limited, registered in Nigeria and headquartered in Port Harcourt, Rivers State.',
        },
        {
          h: '2. Digital Product Purchases & Fulfilment',
          p: 'Products may be fulfilled either via verified external marketplace checkout (Selar) or, where enabled, via native store checkout (Paystack). Where purchases occur on Selar, Selar processes payment and delivers digital files according to their checkout terms.',
        },
        {
          h: '3. Accuracy of Information & Pricing',
          p: 'We maintain clear product specifications, file formats, and currency pricing in NGN and USD. Applicable consumer protection rights under Nigerian law (including the Federal Competition and Consumer Protection Act) apply to all transactions.',
        },
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      path: '/privacy',
      sections: [
        {
          h: '1. Data Protection Compliance',
          p: 'Jeneconk Integrated Global Solutions Limited processes personal information in accordance with the Nigeria Data Protection Act (NDPA) and international privacy principles.',
        },
        {
          h: '2. Information We Collect',
          p: 'We collect only data necessary to deliver digital products, verify purchases, respond to support enquiries, and honour voluntary newsletter subscriptions. We never store payment card numbers on Jeneconk servers.',
        },
        {
          h: '3. Analytics & Marketing Attribution',
          p: 'First-party aggregate event tracking (product views, referral attribution, and outbound checkout clicks) helps us improve catalog clarity without selling personal data to third parties.',
        },
      ],
    },
    refund: {
      title: 'Digital Product Refund Policy',
      path: '/refund-policy',
      sections: [
        {
          h: '1. Balanced Consumer Rights',
          p: 'Because digital files are accessible immediately upon delivery, change-of-mind refunds after confirmed download are generally restricted. However, this policy never limits mandatory statutory rights under the Nigerian Federal Competition and Consumer Protection Act (FCCPA) or applicable local consumer laws.',
        },
        {
          h: '2. Eligible Refund & Replacement Cases',
          p: 'You are eligible for prompt file replacement or a full refund if: (a) a downloaded file is corrupted or materially defective and cannot be resolved by support, (b) the product materially differs from its published description, or (c) an accidental duplicate charge occurred.',
        },
        {
          h: '3. How to Request Assistance',
          p: 'Contact info@jeneconk.com or use our Customer Assistance page with your order reference within 14 days of purchase. For orders processed through Selar, our team will coordinate resolution in line with Selar transaction records.',
        },
      ],
    },
    licence: {
      title: 'Digital Product Licence Policy',
      path: '/licence-policy',
      sections: [
        {
          h: '1. Single Personal & Business Use Licence',
          p: 'Unless explicitly designated as a Multi-Seat, Classroom, or Commercial Template Licence on the product page, each purchase grants one non-exclusive, non-transferable licence for use by the individual or single organisation purchaser.',
        },
        {
          h: '2. Permitted Uses',
          p: 'You may download, print, and annotate planners, workbooks, and spreadsheet templates for your own personal, household, classroom, or internal business operations.',
        },
        {
          h: '3. Prohibited Uses',
          p: 'You may not resell, redistribute, upload to public file-sharing repositories, or claim authorship of Jeneconk templates and digital publications without explicit written commercial licensing.',
        },
      ],
    },
  }[type];

  return (
    <div className="bg-[#FAF8F4] py-14 sm:py-16">
      <SeoHead
        title={`${content.title} | Jeneconk Digital Store`}
        description={`${content.title} for Jeneconk Digital Store operated by Jeneconk Integrated Global Solutions Limited.`}
        path={content.path}
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 bg-white border border-[#E4DDD0] rounded-sm p-8 sm:p-12">
        <div className="pb-6 border-b border-[#E4DDD0]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88329] font-medium">
            Jeneconk Integrated Global Solutions Limited
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[#171A21]">
            {content.title}
          </h1>
        </div>
        <div className="space-y-6">
          {content.sections.map((sec) => (
            <section key={sec.h} className="space-y-2">
              <h2 className="font-display text-xl font-semibold text-[#171A21]">
                {sec.h}
              </h2>
              <p className="text-sm sm:text-base text-[#4A505C] leading-relaxed">
                {sec.p}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { navigate } = useStore();
  return (
    <div className="bg-[#FAF8F4] py-20 sm:py-24">
      <SeoHead
        title="Page Not Found | Jeneconk Digital Store"
        description="The requested page could not be found on Jeneconk Digital Store."
        path="/404"
      />
      <div className="max-w-xl mx-auto px-4 sm:px-6 text-center space-y-5">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#B88329] font-semibold">
          404 · Page Not Found
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#171A21]">
          We Could Not Locate That Page
        </h1>
        <p className="text-sm sm:text-base text-[#4A505C] leading-relaxed">
          The page or digital edition link you followed may have moved or been updated. Explore our live digital catalog below.
        </p>
        <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/shop')}
            className="px-6 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#FAF8F4] bg-[#0A264A] hover:bg-[#061830] rounded-sm transition-colors min-h-[44px]"
          >
            Browse Digital Catalog
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-6 py-3 text-xs uppercase tracking-[0.14em] font-semibold text-[#171A21] bg-white border border-[#D5CCB9] hover:bg-[#F3EEE4] rounded-sm transition-colors min-h-[44px]"
          >
            Return to Homepage
          </button>
        </div>
      </div>
    </div>
  );
}
