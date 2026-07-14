# Performance Optimization Constraints

* Do not introduce any optimization that increases server CPU, memory usage, database reads/writes, Redis operations, QStash traffic, network requests, or infrastructure cost.
* Do not replace static rendering with server-side rendering unless there is a measurable performance benefit without reducing scalability.
* Prefer optimizations that reduce client-side JavaScript execution, bundle size, network payload, browser rendering cost, layout shifts, image weight, and unnecessary React re-renders.
* Preserve the existing architecture (Vercel + Firebase + Redis + QStash) without introducing additional infrastructure or architectural changes.
* All optimizations must be production-safe and maintain the application’s ability to reliably support 10,000 concurrent users without reducing throughput or increasing backend load.