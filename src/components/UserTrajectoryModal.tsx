"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingUp, Calendar, DollarSign, Cpu } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from "recharts";
import { formatNumber, formatCurrency } from "@/lib/utils";

interface UserTrajectoryModalProps {
  username: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function UserTrajectoryModal({
  username,
  isOpen,
  onClose
}: UserTrajectoryModalProps) {
  const [timeRange, setTimeRange] = useState<"all" | "30d" | "7d">("all");
  const [metricType, setMetricType] = useState<"tokens" | "cost">("tokens");

  const data = useQuery(api.users.getUserTrajectory, { username });

  if (!isOpen) return null;

  // Filter data based on time range
  const filteredData = data?.trajectory.filter(point => {
    if (timeRange === "all") return true;
    const days = timeRange === "30d" ? 30 : 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return new Date(point.date) >= cutoffDate;
  }) || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-background border border-border rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="border-b border-border px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {data?.githubAvatar && (
                <img
                  src={data.githubAvatar}
                  alt={data.githubName || username}
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div>
                <h3 className="text-lg font-semibold">{data?.githubName || username}</h3>
                <p className="text-sm text-muted">Token Usage Trajectory</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Controls */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex gap-2">
              {(["all", "30d", "7d"] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    timeRange === range
                      ? "bg-accent text-white"
                      : "hover:bg-accent/10"
                  }`}
                >
                  {range === "all" ? "All Time" : range}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {(["tokens", "cost"] as const).map(metric => (
                <button
                  key={metric}
                  onClick={() => setMetricType(metric)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    metricType === metric
                      ? "bg-accent text-white"
                      : "hover:bg-accent/10"
                  }`}
                >
                  {metric === "tokens" ? "Tokens" : "Cost"}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-12rem)]">
            {!data ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-muted">Loading...</div>
              </div>
            ) : (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-2 text-muted text-sm mb-1">
                      <Calendar className="w-4 h-4" />
                      Total Days
                    </div>
                    <div className="text-2xl font-bold">{data.summary.totalDays}</div>
                  </div>

                  <div className="p-4 bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-2 text-muted text-sm mb-1">
                      <Cpu className="w-4 h-4" />
                      Avg Daily Tokens
                    </div>
                    <div className="text-2xl font-bold">
                      {formatNumber(data.summary.averageDaily.tokens)}
                    </div>
                  </div>

                  <div className="p-4 bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-2 text-muted text-sm mb-1">
                      <TrendingUp className="w-4 h-4" />
                      Peak Usage
                    </div>
                    <div className="text-2xl font-bold">
                      {formatNumber(data.summary.peak.tokens)}
                    </div>
                    <div className="text-xs text-muted mt-1">{data.summary.peak.date}</div>
                  </div>

                  <div className="p-4 bg-card rounded-lg border border-border">
                    <div className="flex items-center gap-2 text-muted text-sm mb-1">
                      <DollarSign className="w-4 h-4" />
                      Total Cost
                    </div>
                    <div className="text-2xl font-bold text-accent">
                      ${formatCurrency(data.summary.totals.totalCost)}
                    </div>
                  </div>
                </div>

                {/* Chart */}
                <div className="bg-card rounded-lg border border-border p-4">
                  <h4 className="text-sm font-medium mb-4">
                    {metricType === "tokens" ? "Token Usage Over Time" : "Cost Over Time"}
                  </h4>
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={filteredData}>
                      <defs>
                        <linearGradient id="colorInput" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorCache" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        dataKey="date"
                        stroke="#888"
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        stroke="#888"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) =>
                          metricType === "tokens"
                            ? formatNumber(value)
                            : `$${formatCurrency(value)}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1918",
                          border: "1px solid #333",
                          borderRadius: "8px"
                        }}
                        formatter={(value: number) =>
                          metricType === "tokens"
                            ? formatNumber(value)
                            : `$${formatCurrency(value)}`
                        }
                      />
                      <Legend />

                      {metricType === "tokens" ? (
                        <>
                          <Area
                            type="monotone"
                            dataKey="inputTokens"
                            stackId="1"
                            stroke="#3b82f6"
                            fillOpacity={1}
                            fill="url(#colorInput)"
                            name="Input Tokens"
                          />
                          <Area
                            type="monotone"
                            dataKey="outputTokens"
                            stackId="1"
                            stroke="#8b5cf6"
                            fillOpacity={1}
                            fill="url(#colorOutput)"
                            name="Output Tokens"
                          />
                          <Area
                            type="monotone"
                            dataKey="cacheTokens"
                            stackId="1"
                            stroke="#10b981"
                            fillOpacity={1}
                            fill="url(#colorCache)"
                            name="Cache Tokens"
                          />
                        </>
                      ) : (
                        <Area
                          type="monotone"
                          dataKey="cost"
                          stroke="#f59e0b"
                          fillOpacity={0.3}
                          fill="#f59e0b"
                          name="Daily Cost"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
