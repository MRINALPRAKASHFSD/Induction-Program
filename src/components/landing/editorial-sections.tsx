import React from 'react';
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Users, Compass, Globe, Activity, ShieldCheck, QrCode } from "lucide-react";
import { m } from "framer-motion";

export function WelcomeSection() {
  return (
    <section className="py-32 bg-[#F9F7F2] relative overflow-hidden">
      <div className="container mx-auto px-6 max-w-5xl text-center">
        <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-[#C7A253] mb-6">Welcome to Aarambh</h2>
        <h3 className="text-4xl md:text-6xl font-serif text-[#2B2B2B] leading-tight mb-8">
          The Beginning of Your <br />
          <span className="italic text-[#8B1E2D]">KRMU Journey</span>
        </h3>
        <div className="h-1 w-24 bg-[#8B1E2D] mx-auto mb-10"></div>
        <p className="text-lg md:text-xl text-[#2B2B2B]/70 max-w-3xl mx-auto leading-relaxed font-light">
          Aarambh is more than just an orientation. It is your formal induction into the K.R. Mangalam University community. Over the next week, you will discover your campus, meet your mentors, and forge friendships that will last a lifetime.
        </p>
      </div>
    </section>
  );
}

export function TimelineSection() {
  const schedule = [
    { day: "Day 1", title: "The Grand Welcome", desc: "Registration, ID Card distribution, and the Vice Chancellor's address." },
    { day: "Day 2", title: "Academic Immersion", desc: "Meet your Deans, understand your curriculum, and explore the libraries." },
    { day: "Day 3", title: "Campus Life & Clubs", desc: "Club fair, sports trials, and cultural performances by senior students." },
    { day: "Day 4", title: "Industry Connect", desc: "Guest lectures from industry leaders and alumni interaction." }
  ];

  return (
    <section className="py-32 bg-white relative">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-5xl font-serif text-[#2B2B2B] font-bold mb-6">Induction Schedule</h2>
            <div className="h-1 w-20 bg-[#8B1E2D]"></div>
          </div>
          <p className="text-[#2B2B2B]/60 mt-6 md:mt-0 font-light max-w-sm">
            A carefully curated week designed to transition you seamlessly into university life.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border-l border-t md:border-l-0 md:border-t-0 md:border-b border-gray-200">
          {schedule.map((item, idx) => (
            <div key={idx} className="p-8 md:p-10 border-b border-r-0 md:border-b-0 md:border-r border-gray-200 relative group hover:bg-[#F9F7F2] transition-colors duration-500">
              <div className="w-3 h-3 bg-[#C7A253] rounded-none absolute -left-[1.5px] top-10 md:left-auto md:top-auto md:-bottom-[1.5px] md:left-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="text-sm font-bold uppercase tracking-widest text-[#8B1E2D] block mb-4">{item.day}</span>
              <h3 className="text-xl font-serif text-[#2B2B2B] font-bold mb-4">{item.title}</h3>
              <p className="text-[#2B2B2B]/70 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SchoolsSection() {
  const schools = [
    { name: "School of Engineering & Technology", icon: Globe },
    { name: "School of Management & Commerce", icon: Users },
    { name: "School of Medical & Allied Sciences", icon: Activity },
    { name: "School of Humanities", icon: BookOpen },
    { name: "School of Architecture & Design", icon: Compass },
    { name: "School of Legal Studies", icon: ShieldCheck }
  ];

  return (
    <section className="py-32 bg-[#17365D] text-white">
      <div className="container mx-auto px-6 max-w-7xl">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-serif font-bold mb-6">Our Schools</h2>
          <div className="h-1 w-24 bg-[#C7A253] mx-auto mb-6"></div>
          <p className="text-white/70 max-w-2xl mx-auto font-light">
            Diverse disciplines, united by a commitment to excellence and innovation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
          {schools.map((school, i) => (
            <div key={i} className="bg-[#1e4475] p-10 hover:bg-[#8B1E2D] transition-colors duration-500 group flex items-start gap-6 cursor-default">
              <school.icon className="w-8 h-8 text-[#C7A253] shrink-0" />
              <div>
                <h3 className="text-lg font-serif font-bold leading-tight group-hover:text-white transition-colors">{school.name}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CTASection() {
  return (
    <section className="py-32 bg-white text-center">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="w-16 h-16 mx-auto bg-[#F9F7F2] rounded-full flex items-center justify-center mb-8 border border-gray-200">
          <QrCode className="w-8 h-8 text-[#8B1E2D]" />
        </div>
        <h2 className="text-3xl md:text-5xl font-serif text-[#2B2B2B] font-bold mb-6">Begin Your Journey</h2>
        <p className="text-lg text-[#2B2B2B]/60 mb-10 max-w-2xl mx-auto font-light">
          Register now to generate your orientation QR code. This code will be your pass to all events, meals, and sessions during Aarambh.
        </p>
        <Button asChild className="rounded-none bg-[#8B1E2D] hover:bg-[#6b1622] text-white px-10 h-14 font-bold uppercase tracking-widest text-xs shadow-xl transition-colors">
          <Link to="/register">
            Register for Aarambh <ArrowRight className="ml-3 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
