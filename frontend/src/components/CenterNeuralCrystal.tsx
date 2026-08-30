"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface CenterNeuralCrystalProps {
  scrollProgress?: number; // 0 to 1 from GSAP ScrollTrigger
  activeStage?: number; // 0, 1, 2, 3
}

export default function CenterNeuralCrystal({ scrollProgress = 0, activeStage = 0 }: CenterNeuralCrystalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(scrollProgress);
  const stageRef = useRef(activeStage);

  // Sync refs to avoid re-initializing Three.js on every prop change
  useEffect(() => {
    progressRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    stageRef.current = activeStage;
  }, [activeStage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 1. Scene & Camera Setup (Camera locked permanently at center)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 8.5);
    camera.lookAt(0, 0, 0);

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // 3. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const rimLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    rimLight1.position.set(5, 6, 4);
    scene.add(rimLight1);

    const rimLight2 = new THREE.DirectionalLight(0x27272a, 0.6);
    rimLight2.position.set(-5, -4, -3);
    scene.add(rimLight2);

    // Internal Point Light (casts atmospheric glow through smoked glass faces)
    const innerLight = new THREE.PointLight(0xf59e0b, 4.0, 15, 1.2);
    innerLight.position.set(0, 0, 0);
    scene.add(innerLight);

    // 4. Heavy Solid Faceted Core Assembly (Option A: Obsidian / Smoked Glass Core)
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // Scale to ~65% footprint to sit comfortably behind foreground diagram
    coreGroup.scale.set(0.68, 0.68, 0.68);

    // A. Solid Shaded Obsidian Facets
    const outerGeo = new THREE.IcosahedronGeometry(1.65, 0);
    const outerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x0c0c10),
      roughness: 0.18,
      metalness: 0.35,
      clearcoat: 0.65,
      clearcoatRoughness: 0.15,
      transmission: 0.45, // Smoked glass effect letting inner core glow emerge
      ior: 1.52,
      thickness: 1.2,
      flatShading: true,
      transparent: true,
      opacity: 0.88,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    coreGroup.add(outerMesh);

    // B. Subtle Emissive Edge Wireframe (Thin rim glow, not full wireframe)
    const edgeGeo = new THREE.WireframeGeometry(outerGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(0xf59e0b),
      transparent: true,
      opacity: 0.35,
      linewidth: 1.0,
    });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    coreGroup.add(edgeLines);

    // C. Internal Molten Core (Pulsing glowing sphere inside)
    const innerCoreGeo = new THREE.SphereGeometry(0.75, 24, 24);
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xf59e0b),
      transparent: true,
      opacity: 0.75,
    });
    const innerCoreMesh = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    coreGroup.add(innerCoreMesh);

    // 5. Animation & Scroll Sync Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();
    let lastProgress = progressRef.current;
    let extraRotationVelocity = 0;

    // Color Palette per Stage
    const colorStage1 = new THREE.Color(0x64748b); // Smoky titanium / slate (0-20%)
    const colorStage2 = new THREE.Color(0xf59e0b); // Amber scoring (20-45%)
    const colorStage3 = new THREE.Color(0xef4444); // Crimson/Amber fork (45-70%)
    const colorStage4 = new THREE.Color(0x10b981); // Emerald resolved (70-100%)
    const activeColor = new THREE.Color(0x64748b);

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (document.hidden) return;

      const elapsedTime = clock.getElapsedTime();
      const currentProgress = progressRef.current;

      // Heavy deliberate rotation velocity
      const progressDelta = Math.abs(currentProgress - lastProgress);
      lastProgress = currentProgress;
      extraRotationVelocity = THREE.MathUtils.lerp(extraRotationVelocity, progressDelta * 8.0, 0.08);

      if (!prefersReducedMotion) {
        // Slow weighted idle rotation
        coreGroup.rotation.y += 0.0035 + extraRotationVelocity;
        coreGroup.rotation.x += 0.0018 + extraRotationVelocity * 0.4;

        // Subtle atmospheric breathing oscillation
        coreGroup.position.y = Math.sin(elapsedTime * 1.2) * 0.04;
      }

      // =========================================================================
      // STAGE COLOR INTERPOLATION & GLOW MORPHING
      // =========================================================================
      const p = currentProgress;

      if (p < 0.25) {
        // Stage 01: Raw Titanium Ingestion (Smoky Slate)
        const t = p / 0.25;
        activeColor.copy(colorStage1);
        innerCoreMat.opacity = 0.55 + Math.sin(elapsedTime * 3) * 0.15;
        innerLight.intensity = 2.5 + Math.sin(elapsedTime * 3) * 0.6;
        edgeMat.opacity = 0.25;
      } else if (p < 0.50) {
        // Stage 02: Amber Scorer Heat
        const t = (p - 0.25) / 0.25;
        activeColor.lerpColors(colorStage1, colorStage2, t);
        innerCoreMat.opacity = 0.75 + Math.sin(elapsedTime * 5) * 0.2;
        innerLight.intensity = 3.8 + Math.sin(elapsedTime * 5) * 0.8;
        edgeMat.opacity = 0.45;
      } else if (p < 0.75) {
        // Stage 03: The Fork Energy Split (Crimson/Amber)
        const t = (p - 0.50) / 0.25;
        activeColor.lerpColors(colorStage2, colorStage3, t);
        innerCoreMat.opacity = 0.85 + Math.sin(elapsedTime * 8) * 0.15;
        innerLight.intensity = 5.0 + Math.sin(elapsedTime * 8) * 1.0;
        edgeMat.opacity = 0.60;
      } else {
        // Stage 04: Resolved Emerald Luminescence
        const t = Math.min((p - 0.75) / 0.25, 1.0);
        activeColor.lerpColors(colorStage3, colorStage4, t);
        innerCoreMat.opacity = 0.70 + Math.sin(elapsedTime * 2) * 0.1;
        innerLight.intensity = 3.5;
        edgeMat.opacity = 0.35;
      }

      // Apply interpolated color to inner light and subtle rim
      innerLight.color.copy(activeColor);
      innerCoreMat.color.copy(activeColor);
      edgeMat.color.copy(activeColor);

      renderer.render(scene, camera);
    };

    animate();

    // 6. Resize Handler
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener("resize", handleResize);

    // 7. Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);

      outerGeo.dispose();
      outerMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      innerCoreGeo.dispose();
      innerCoreMat.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden flex items-center justify-center filter blur-[2.5px] opacity-55 hidden md:flex"
      aria-hidden="true"
    />
  );
}
