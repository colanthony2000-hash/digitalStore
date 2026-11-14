import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  collections,
  ecosystemPlatforms,
  products,
  storeSettings,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;

async function runSeed(): Promise<void> {
  try {
    const [{ value: catCount }] = await db.select({ value: count() }).from(categories);

    if (catCount === 0) {
      const insertedCategories = await db
        .insert(categories)
        .values([
          {
            slug: 'personal-development-lifestyle',
            name: 'Personal Development & Lifestyle',
            description:
              'Structured planners, habit trackers, personal transformation workbooks, and seasonal organisers for intentional living.',
            subtopics: [
              'Life planning',
              'Personal transformation',
              'Goal setting',
              'Habit tracking',
              'Productivity',
              'Journals',
              'Family organisation',
              'Seasonal planners',
            ],
            imageUrl: '/assets/images/product_life_reset_1794558203230.jpg',
            ecosystemApp: 'StudyCoach',
            ecosystemUrl: 'https://studycoach.jeneconk.com',
            sortOrder: 1,
            isActive: true,
          },
          {
            slug: 'business-financial-resources',
            name: 'Business & Financial Resources',
            description:
              'Spreadsheet templates, bookkeeping ledgers, inventory trackers, budgeting systems, and operational frameworks for growing enterprises.',
            subtopics: [
              'Business planning',
              'Bookkeeping templates',
              'Budgeting spreadsheets',
              'Inventory management',
              'Financial trackers',
              'Business administration',
              'Entrepreneurship toolkits',
              'Cash-flow management',
            ],
            imageUrl: '/assets/images/product_business_finance_1794558204496.jpg',
            ecosystemApp: 'KoboLedger',
            ecosystemUrl: 'https://koboledger.jeneconk.com',
            sortOrder: 2,
            isActive: true,
          },
          {
            slug: 'education-learning',
            name: 'Education & Learning',
            description:
              'Lesson planners, mathematics workbooks, study organisers, exam preparation manuals, and school administration packs.',
            subtopics: [
              'Teacher resources',
              'Lesson planning',
              'Mathematics workbooks',
              'Examination preparation',
              'Study planners',
              'Educational templates',
              'Training manuals',
              'School administration resources',
            ],
            imageUrl: '/assets/aistudio/How_to_Write_a_Lesson_Note_7f1cbb35.png',
            ecosystemApp: 'Edu Suite',
            ecosystemUrl: 'https://edu.jeneconk.com',
            sortOrder: 3,
            isActive: true,
          },
          {
            slug: 'marketing-entrepreneurship',
            name: 'Marketing & Entrepreneurship',
            description:
              'Lead generation playbooks, sales pipelines, marketing calendars, social media planning sheets, and client onboarding toolkits.',
            subtopics: [
              'Lead generation resources',
              'Sales trackers',
              'Marketing calendars',
              'Social media planning',
              'Client onboarding',
              'Business promotion',
              'Digital marketing toolkits',
            ],
            imageUrl: '/assets/images/product_business_finance_1794558204496.jpg',
            ecosystemApp: 'LeadGen',
            ecosystemUrl: 'https://leadgen.jeneconk.com',
            sortOrder: 4,
            isActive: true,
          },
          {
            slug: 'ai-digital-productivity',
            name: 'AI & Digital Productivity',
            description:
              'Practical AI prompt libraries, prompt engineering guides, workflow automation blueprints, and digital productivity systems.',
            subtopics: [
              'AI prompt collections',
              'ChatGPT guides',
              'Prompt engineering',
              'AI productivity workbooks',
              'Automation resources',
              'Digital workflow templates',
              'AI business toolkits',
            ],
            imageUrl: '/assets/images/hero_digital_products_1794558203570.jpg',
            ecosystemApp: 'StudyCoach',
            ecosystemUrl: 'https://studycoach.jeneconk.com',
            sortOrder: 5,
            isActive: true,
          },
          {
            slug: 'creative-design-resources',
            name: 'Creative & Design Resources',
            description:
              'Editable Canva templates, business flyer kits, social media packs, presentation decks, and cohesive branding systems.',
            subtopics: [
              'Canva templates',
              'Social media templates',
              'Business flyers',
              'Presentation templates',
              'Branding resources',
              'Creative content packs',
            ],
            imageUrl: '/assets/images/christmas_planner_card_cover.png',
            ecosystemApp: null,
            ecosystemUrl: null,
            sortOrder: 6,
            isActive: true,
          },
        ])
        .returning();

      const personalDevCat = insertedCategories.find(
        (c) => c.slug === 'personal-development-lifestyle'
      );
      const educationCat = insertedCategories.find(
        (c) => c.slug === 'education-learning'
      );

      const insertedProducts = await db
        .insert(products)
        .values([
          {
            slug: 'life-reset',
            name: 'The 2027 Life Reset Planner',
            shortBenefit:
              'A practical workbook for organising your money, goals, habits, wellness and everyday life with an 8-step framework.',
            shortDescription:
              'Practical personal reset digital workbook by Collins Otomewo Anthony designed to help you plan goals, finances, habits, and accountability.',
            fullDescription:
              'The 2027 Life Reset Planner is a complete life planning workbook created by Collins Otomewo Anthony and published by Jeneconk Integrated Global Solutions Limited.\n\nInstead of vague motivational prompts, it guides you through an 8-step framework for real progress — covering money, goals, habits, wellbeing, relationships, and consistent accountability.\n\nGet clear on where you are, decide where you want to go, and build a life that moves in that direction on tablet or home printing.',
            categoryId: personalDevCat?.id ?? null,
            coverImage: '/assets/aistudio/2027_Life_Reset_Planner_Poster_49b4248e.png',
            previewImages: [
              '/assets/aistudio/2027_Life_Reset_Planner_Poster_49b4248e.png',
            ],
            fileFormat: 'PDF',
            fileSize: null,
            version: '2027.1',
            contentsList: [
              'A Complete Life Planning System for goals, finances, and habits',
              '8-Step Framework for Real Progress from reflection to action',
              'Support sections for Wellbeing & Balanced Relationships',
              'Progress Tracking & Accountability Review Pages',
            ],
            keyBenefits: [
              'Plan your goals, finances, habits, and wellness in one structured place',
              'Move from reflection to daily execution with a clear 8-step framework',
              'Works seamlessly on tablets, laptops, or printed A4/Letter binders',
            ],
            intendedAudience: [
              'Working professionals seeking clarity and better work-life structure',
              'Students preparing for a focused academic and personal year',
              'Entrepreneurs and creators rebuilding productive daily routines',
            ],
            requirements:
              'Any standard PDF reader or tablet annotation app (GoodNotes, Notability, Adobe Acrobat) or a standard printer.',
            instructions:
              'Click Buy on Selar to complete your purchase securely. Selar delivers your downloadable PDF immediately upon confirmation.',
            licenceType:
              'Single Personal Use Licence. Licensed to one buyer for personal use; redistribution or commercial resale is prohibited.',
            faqs: [
              {
                question: 'How is Life Reset delivered after purchase?',
                answer:
                  'Purchases are processed and fulfilled through Selar. Immediately after payment confirmation on Selar, you receive instant download access and an email copy.',
              },
              {
                question: 'Can I print this workbook or use it digitally?',
                answer:
                  'Yes. The 2027 Life Reset Planner is delivered as a high-resolution PDF suitable for both digital tablet annotation and crisp home printing.',
              },
              {
                question: 'Are refunds available for digital downloads?',
                answer:
                  'Please review our Digital Refund Policy. If you experience a defective file or duplicate transaction, contact Jeneconk support for prompt resolution.',
              },
            ],
            priceNgnKobo: null,
            originalPriceNgnKobo: null,
            priceUsdCents: null,
            originalPriceUsdCents: null,
            isFree: false,
            status: 'published',
            isFeatured: true,
            isBestseller: false,
            isNewArrival: true,
            verifiedSalesCount: 0,
            checkoutMode: 'selar',
            marketplaceUrl: 'https://selar.com/9787v34320',
            nativeCheckoutEligible: false,
            ecosystemName: 'StudyCoach',
            ecosystemUrl: 'https://studycoach.jeneconk.com',
            ecosystemPitch:
              'Combining personal goal setting with structured learning? Explore StudyCoach to stay consistent with study milestones.',
            seoTitle: 'The 2027 Life Reset Planner Digital Workbook | Jeneconk Digital Store',
            seoDescription:
              'Plan your money, goals, habits, and wellbeing with The 2027 Life Reset Planner digital PDF workbook from Jeneconk.',
          },
          {
            slug: 'christmas-planner',
            name: 'The Christmas Budget, Gift & Holiday Planner (2026 Edition)',
            shortBenefit:
              'A practical planner for your festive budget, gifts, shopping, food & home prep, travel, and celebrations.',
            shortDescription:
              'Plan thoughtfully, spend wisely, and celebrate beautifully with the 2026 Christmas Budget, Gift & Holiday Planner by Collins Otomewo Anthony.',
            fullDescription:
              'The Christmas Budget, Gift & Holiday Planner (2026 Edition) brings calm, structured organisation and clear budgeting to the busiest season of the year.\n\nCreated by Collins Otomewo Anthony and published by Jeneconk Integrated Global Solutions Limited for Nigerian and international households, it organises your festive budget, gifts, shopping lists, food & home prep, and holiday travel in one stress-free PDF edition.',
            categoryId: personalDevCat?.id ?? null,
            coverImage: '/assets/images/christmas_planner_card_cover.png',
            previewImages: [
              '/assets/images/christmas_planner_card_cover.png',
              '/assets/aistudio/Christmas_Budget_Planner_2026_f2a22a93.png',
            ],
            fileFormat: 'PDF',
            fileSize: null,
            version: '2026.1',
            contentsList: [
              'Plan Your Budget — Seasonal Spending & Expense Trackers',
              'Organise Gifts & Manage Shopping Status Lists',
              'Prepare Food & Home Hosting Checklists',
              'Plan Travel & Holiday Celebrations Schedules',
            ],
            keyBenefits: [
              'Plan thoughtfully and spend wisely with clear budget trackers',
              'Keep gifts, shopping, food prep, and family travel organised in one place',
              'Use digitally on tablet or print a clean seasonal family binder',
            ],
            intendedAudience: [
              'Families and household organisers planning festive budgets and gatherings',
              'Busy professionals balancing year-end deadlines with holiday prep',
              'Event hosts coordinating multi-day seasonal celebrations',
            ],
            requirements:
              'Any PDF viewer, tablet annotation app (GoodNotes, Notability, Xodo), or standard A4/Letter printer.',
            instructions:
              'Click Buy on Selar to proceed to our verified Selar listing. Your Christmas Planner PDF will be delivered directly by Selar after checkout.',
            licenceType:
              'Single Personal & Household Use Licence. Licensed to the purchaser for personal/family planning.',
            faqs: [
              {
                question: 'Is this a physical shipped planner?',
                answer:
                  'No. Christmas Planner is a digital PDF download delivered immediately by Selar after checkout, with zero shipping delays.',
              },
              {
                question: 'Can I use it in Nigeria and internationally?',
                answer:
                  'Yes. Budget columns and date layouts are adaptable to any currency and family schedule.',
              },
            ],
            priceNgnKobo: null,
            originalPriceNgnKobo: null,
            priceUsdCents: null,
            originalPriceUsdCents: null,
            isFree: false,
            status: 'published',
            isFeatured: true,
            isBestseller: false,
            isNewArrival: true,
            verifiedSalesCount: 0,
            checkoutMode: 'selar',
            marketplaceUrl: 'https://selar.com/28975l0775',
            nativeCheckoutEligible: false,
            ecosystemName: 'KoboLedger',
            ecosystemUrl: 'https://koboledger.jeneconk.com',
            ecosystemPitch:
              'Looking for year-round expense and business bookkeeping? Discover KoboLedger by Jeneconk.',
            seoTitle: 'Christmas Budget, Gift & Holiday Planner (2026 Edition) | Jeneconk',
            seoDescription:
              'Plan holiday budgets, gift lists, food prep, and travel effortlessly with the 2026 Christmas Budget, Gift & Holiday Planner PDF from Jeneconk.',
          },
          {
            slug: 'how-to-write-a-lesson-note',
            name: 'How to Write a Lesson Note: A Practical Guide to Planning, Teaching, and Checking Learning',
            shortBenefit:
              'Jeneconk Educational Practice Series guide helping teachers set objectives, plan activities, choose aids, and assess learning.',
            shortDescription:
              'Practical educator manual by Collins Otomewo Anthony covering learning objectives, teaching activities, instructional aids, and assessment.',
            fullDescription:
              'How to Write a Lesson Note: A Practical Guide to Planning, Teaching, and Checking Learning is part of the Jeneconk Educational Practice Series by Collins Otomewo Anthony.\n\nBuilt for classroom teachers, heads of department, and student teachers, it walks step by step through setting clear learning objectives, planning classroom activities, choosing teaching aids, and assessing student learning effectively.',
            categoryId: educationCat?.id ?? null,
            coverImage: '/assets/aistudio/How_to_Write_a_Lesson_Note_7f1cbb35.png',
            previewImages: ['/assets/aistudio/How_to_Write_a_Lesson_Note_7f1cbb35.png'],
            fileFormat: 'PDF',
            fileSize: null,
            version: '1.0',
            contentsList: [
              'Setting Clear, Measurable Learning Objectives',
              'Planning Structured Teacher & Learner Activities',
              'Choosing Effective Teaching Aids & Instructional Materials',
              'Assessing Student Learning & Lesson Reflection',
            ],
            keyBenefits: [
              'Prepare inspection-ready, classroom-proven lesson notes faster',
              'Connect every learning objective directly to activities and assessment',
              'Apply practical teaching aids and checking-for-learning checks immediately',
            ],
            intendedAudience: [
              'Primary and secondary school teachers',
              'Heads of department and academic supervisors',
              'Student teachers and teaching academy trainees',
            ],
            requirements:
              'Any standard PDF reader on phone, tablet, laptop, or desktop computer.',
            instructions:
              'Click Buy on Selar to complete checkout and download your digital guide immediately.',
            licenceType:
              'Single Educator Use Licence. Licensed to one teacher or purchaser for personal classroom planning.',
            faqs: [
              {
                question: 'Who is this guide designed for?',
                answer:
                  'It is written for classroom teachers, subject heads, and trainee educators looking for a practical framework for lesson planning, delivery, and checking learning.',
              },
              {
                question: 'How do I access the guide after payment?',
                answer:
                  'Selar provides immediate digital download access and sends a confirmation email link right after checkout.',
              },
            ],
            priceNgnKobo: null,
            originalPriceNgnKobo: null,
            priceUsdCents: null,
            originalPriceUsdCents: null,
            isFree: false,
            status: 'published',
            isFeatured: true,
            isBestseller: false,
            isNewArrival: true,
            verifiedSalesCount: 0,
            checkoutMode: 'selar',
            marketplaceUrl: 'https://selar.com/y57r1c28m7',
            nativeCheckoutEligible: false,
            ecosystemName: 'Jeneconk Edu Suite',
            ecosystemUrl: 'https://edu.jeneconk.com',
            ecosystemPitch:
              'Managing school-wide lesson notes, academic records, and assessments? Explore Jeneconk Edu Suite.',
            seoTitle:
              'How to Write a Lesson Note: Practical Guide | Jeneconk Digital Store',
            seoDescription:
              'Learn how to write structured lesson notes, plan engaging classes, and check student learning with this practical digital guide from Jeneconk.',
          },
          {
            slug: 'free-starter-resource',
            name: '7 Essential Components of a Good Lesson Note (Free Mini Guide)',
            shortBenefit:
              'A practical free introduction for teachers and student teachers — companion mini guide to How to Write a Lesson Note.',
            shortDescription:
              'Complimentary mini guide outlining the 7 essential components of a strong lesson note, published free by Jeneconk Education on Selar.',
            fullDescription:
              '7 Essential Components of a Good Lesson Note is a complimentary mini guide from Jeneconk Education designed as a practical introduction for classroom teachers and student teachers.\n\nServing as a direct companion to the full edition How to Write a Lesson Note by Collins Otomewo Anthony, it can be downloaded completely free via our official Selar storefront.',
            categoryId: educationCat?.id ?? null,
            coverImage: '/assets/images/lesson_note_free_mini_guide_card_cover.png',
            previewImages: [
              '/assets/images/lesson_note_free_mini_guide_card_cover.png',
              '/assets/aistudio/7_ESSENTIAL.._2a79cfe0.png',
            ],
            fileFormat: 'PDF',
            fileSize: null,
            version: '1.0',
            contentsList: [
              'Concise overview of the 7 essential components of a good lesson note',
              'Companion orientation for the full How to Write a Lesson Note guide',
            ],
            keyBenefits: [
              'Download free on Selar with zero payment required',
              'Quick-reference checklist tailored for teachers and student teachers',
            ],
            intendedAudience: [
              'Teachers seeking a fast lesson-note structure refresher',
              'Student teachers and teaching practice candidates',
            ],
            requirements:
              'Any standard PDF viewer or modern browser.',
            instructions:
              'Click Get Free to claim and download this complimentary mini guide directly via our official Selar page.',
            licenceType:
              'Single Personal Use Licence. Free for individual download; commercial resale is prohibited.',
            faqs: [
              {
                question: 'Is this mini guide completely free?',
                answer:
                  'Yes. Follow the Selar link to download this companion mini guide at zero cost.',
              },
            ],
            priceNgnKobo: 0,
            originalPriceNgnKobo: null,
            priceUsdCents: 0,
            originalPriceUsdCents: null,
            isFree: true,
            status: 'published',
            isFeatured: true,
            isBestseller: false,
            isNewArrival: true,
            verifiedSalesCount: 0,
            checkoutMode: 'selar',
            marketplaceUrl: 'https://selar.com/1x877k7i11',
            nativeCheckoutEligible: false,
            ecosystemName: 'Jeneconk Edu Suite',
            ecosystemUrl: 'https://edu.jeneconk.com',
            ecosystemPitch:
              'Managing school-wide lesson notes and academic planning? Explore Jeneconk Edu Suite.',
            seoTitle:
              '7 Essential Components of a Good Lesson Note (Free Mini Guide) | Jeneconk',
            seoDescription:
              'Download the free 7 Essential Components of a Good Lesson Note mini guide for teachers and student teachers via Jeneconk Digital Store on Selar.',
          },
        ])
        .returning();

      const lifeReset = insertedProducts.find((p) => p.slug === 'life-reset');
      const christmasPlanner = insertedProducts.find(
        (p) => p.slug === 'christmas-planner'
      );
      const lessonNoteGuide = insertedProducts.find(
        (p) => p.slug === 'how-to-write-a-lesson-note'
      );
      const freeLessonMiniGuide = insertedProducts.find(
        (p) => p.slug === 'free-starter-resource'
      );

      await db.insert(collections).values([
        {
          slug: 'personal-growth-essentials',
          title: 'Personal Growth Essentials',
          subtitle:
            'Reflective workbooks and habit systems built for deliberate daily progress.',
          productIds: lifeReset ? [lifeReset.id] : [],
          isActive: true,
          sortOrder: 1,
        },
        {
          slug: 'seasonal-planning-collection',
          title: 'Seasonal Planning Collection',
          subtitle:
            'Thoughtful planners for festive budgeting, family schedules, and year-end reviews.',
          productIds: christmasPlanner ? [christmasPlanner.id] : [],
          isActive: true,
          sortOrder: 2,
        },
        {
          slug: 'business-productivity-toolkit',
          title: 'Business Productivity Toolkit',
          subtitle:
            'Financial trackers, bookkeeping sheets, and operational systems for SMEs.',
          productIds: [],
          isActive: true,
          sortOrder: 3,
        },
        {
          slug: 'teachers-resource-collection',
          title: "Teacher's Resource Collection",
          subtitle:
            'Classroom lesson planners, assessment packs, and exam preparation guides.',
          productIds: [
            ...(lessonNoteGuide ? [lessonNoteGuide.id] : []),
            ...(freeLessonMiniGuide ? [freeLessonMiniGuide.id] : []),
          ],
          isActive: true,
          sortOrder: 4,
        },
        {
          slug: 'ai-productivity-starter-pack',
          title: 'AI Productivity Starter Pack',
          subtitle:
            'Structured prompt collections and workflow playbooks for modern teams.',
          productIds: [],
          isActive: true,
          sortOrder: 5,
        },
      ]);
    }

    const [{ value: settingsCount }] = await db
      .select({ value: count() })
      .from(storeSettings);

    if (settingsCount === 0) {
      await db.insert(storeSettings).values([
        { key: 'native_checkout_enabled', value: 'false' },
        { key: 'promo_banner_enabled', value: 'false' },
        { key: 'promo_banner_text', value: '' },
        { key: 'hero_kicker', value: 'Jeneconk Integrated Global Solutions' },
        { key: 'free_promo_headline', value: 'Starter Guides & Store Releases' },
        {
          key: 'free_promo_subtext',
          value:
            'Receive new digital edition announcements, complimentary starter guides, and seasonal planning kits directly from Jeneconk Digital Store.',
        },
        { key: 'support_email', value: 'info@jeneconk.com' },
        { key: 'business_email', value: 'business@jeneconk.com' },
        { key: 'whatsapp_number', value: '' },
        { key: 'pinterest_tag_id', value: '' },
        { key: 'ga_measurement_id', value: '' },
      ]);
    }

    const [{ value: ecoCount }] = await db
      .select({ value: count() })
      .from(ecosystemPlatforms);

    if (ecoCount === 0) {
      await db.insert(ecosystemPlatforms).values([
        {
          slug: 'edu-suite-2',
          name: 'Edu Suite 2.0',
          category: 'Education & Learning',
          relatedCategorySlug: 'education-learning',
          description:
            'School workflow, lesson notes, assessment, and academic documentation platform for schools and educators.',
          destinationUrl: 'https://edu.jeneconk.com',
          iconName: 'GraduationCap',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 1,
        },
        {
          slug: 'studycoach',
          name: 'AI Study Coach / StudyCoach',
          category: 'Education & Learning',
          relatedCategorySlug: 'personal-development-lifestyle',
          description:
            'Guided study accountability and structured examination preparation companion for independent learners.',
          destinationUrl: 'https://studycoach.jeneconk.com',
          iconName: 'BrainCircuit',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 2,
        },
        {
          slug: 'jems-english-mastery',
          name: 'JEMS English Mastery',
          category: 'Education & Learning',
          relatedCategorySlug: 'education-learning',
          description:
            'English language mastery learning platform developed by Jeneconk Education.',
          destinationUrl: 'https://english.jeneconk.com',
          iconName: 'BookOpenCheck',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 3,
        },
        {
          slug: 'cbt-institutional-setup',
          name: 'CBT Institutional Setup',
          category: 'Education & Learning',
          relatedCategorySlug: 'education-learning',
          description:
            'Institutional computer-based testing setup solution by Jeneconk Integrated Global Solutions Limited.',
          destinationUrl: null,
          iconName: 'MonitorCheck',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 4,
        },
        {
          slug: 'business-suite',
          name: 'Business Suite',
          category: 'Business & Finance',
          relatedCategorySlug: 'business-financial-resources',
          description:
            'Business operations and enterprise management platform developed by Jeneconk Integrated Global Solutions Limited.',
          destinationUrl: 'https://business.jeneconk.com',
          iconName: 'BriefcaseBusiness',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 5,
        },
        {
          slug: 'koboledger',
          name: 'KoboLedger',
          category: 'Business & Finance',
          relatedCategorySlug: 'business-financial-resources',
          description:
            'Bookkeeping and cash-flow management software for growing businesses and individuals.',
          destinationUrl: 'https://koboledger.jeneconk.com',
          iconName: 'Wallet',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 6,
        },
        {
          slug: 'smart-procurement',
          name: 'Smart Procurement',
          category: 'Business & Finance',
          relatedCategorySlug: 'business-financial-resources',
          description:
            'Procurement workflow software solution by Jeneconk Integrated Global Solutions Limited.',
          destinationUrl: null,
          iconName: 'ClipboardCheck',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 7,
        },
        {
          slug: 'leadgen',
          name: 'LeadGen',
          category: 'Marketing & Growth',
          relatedCategorySlug: 'marketing-entrepreneurship',
          description:
            'Customer acquisition and business lead generation workflow platform.',
          destinationUrl: 'https://leadgen.jeneconk.com',
          iconName: 'Megaphone',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 8,
        },
        {
          slug: 'ai-training-academy',
          name: 'AI Training Academy',
          category: 'Training & Professional Development',
          relatedCategorySlug: 'ai-digital-productivity',
          description:
            'Professional AI training and digital skills academy by Jeneconk Integrated Global Solutions Limited.',
          destinationUrl: null,
          iconName: 'Sparkles',
          logoUrl: null,
          status: 'published',
          isFeatured: true,
          sortOrder: 9,
        },
      ]);
    }

    // Idempotent repair: rewrite any legacy /src/assets/images/... paths and keep clean card covers
    const existingCats = await db.select().from(categories);
    for (const c of existingCats) {
      if (c.imageUrl && c.imageUrl.startsWith('/src/assets/images/')) {
        const nextUrl = c.imageUrl.replace('/src/assets/images/', '/assets/images/');
        await db.update(categories).set({ imageUrl: nextUrl }).where(eq(categories.id, c.id));
      } else if (
        c.slug === 'creative-design-resources' &&
        c.imageUrl === '/assets/aistudio/Christmas_Budget_Planner_2026_f2a22a93.png'
      ) {
        await db
          .update(categories)
          .set({ imageUrl: '/assets/images/christmas_planner_card_cover.png' })
          .where(eq(categories.id, c.id));
      }
    }

    const existingProds = await db.select().from(products);
    for (const p of existingProds) {
      let nextCover = p.coverImage;
      let nextPreviews = Array.isArray(p.previewImages) ? [...p.previewImages] : [];
      let changed = false;

      if (nextCover && nextCover.startsWith('/src/assets/images/')) {
        nextCover = nextCover.replace('/src/assets/images/', '/assets/images/');
        changed = true;
      }

      if (
        p.slug === 'christmas-planner' &&
        nextCover === '/assets/aistudio/Christmas_Budget_Planner_2026_f2a22a93.png'
      ) {
        nextCover = '/assets/images/christmas_planner_card_cover.png';
        nextPreviews = [
          '/assets/images/christmas_planner_card_cover.png',
          '/assets/aistudio/Christmas_Budget_Planner_2026_f2a22a93.png',
        ];
        changed = true;
      }

      if (
        p.slug === 'free-starter-resource' &&
        nextCover === '/assets/aistudio/7_ESSENTIAL.._2a79cfe0.png'
      ) {
        nextCover = '/assets/images/lesson_note_free_mini_guide_card_cover.png';
        nextPreviews = [
          '/assets/images/lesson_note_free_mini_guide_card_cover.png',
          '/assets/aistudio/7_ESSENTIAL.._2a79cfe0.png',
        ];
        changed = true;
      }

      if (p.slug === 'life-reset' && nextPreviews.some((u) => u.includes('product_life_reset_'))) {
        nextPreviews = ['/assets/aistudio/2027_Life_Reset_Planner_Poster_49b4248e.png'];
        changed = true;
      }

      if (nextPreviews.some((u) => u.startsWith('/src/assets/images/'))) {
        nextPreviews = nextPreviews.map((u) =>
          u.replace('/src/assets/images/', '/assets/images/')
        );
        changed = true;
      }

      if (changed) {
        await db
          .update(products)
          .set({ coverImage: nextCover, previewImages: nextPreviews })
          .where(eq(products.id, p.id));
      }
    }
  } catch (error) {
    console.error('Database seed warning:', error);
  }
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}
