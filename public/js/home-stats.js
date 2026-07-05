document.addEventListener('DOMContentLoaded', () => {
  const section = document.getElementById('impact-statistics');
  if (!section) return;

  const cards = section.querySelectorAll('.impact-card');
  let hasAnimated = false;

  const animateCounter = (element, target, duration) => {
    const start = 0;
    const startTime = performance.now();

    const tick = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.floor(start + (target - start) * progress);
      element.textContent = value.toLocaleString();

      if (progress < 1) {
        window.requestAnimationFrame(tick);
      } else {
        element.textContent = target.toLocaleString();
      }
    };

    window.requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries, observerInstance) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || hasAnimated) return;

      hasAnimated = true;

      cards.forEach((card, index) => {
        const counter = card.querySelector('.counter');
        const target = Number(card.dataset.target || 0);
        const delay = index * 150;

        card.classList.add('in-view');

        window.setTimeout(() => {
          if (counter) {
            animateCounter(counter, target, 2000);
          }
        }, delay);
      });

      observerInstance.disconnect();
    });
  }, {
    threshold: 0.3
  });

  observer.observe(section);
});
