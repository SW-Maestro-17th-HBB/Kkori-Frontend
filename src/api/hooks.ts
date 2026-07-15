import { useQuery } from "@tanstack/react-query";
import {
  fetchNotifications,
  fetchProfile,
  fetchReportDetail,
  fetchReports,
  fetchReportStats,
  fetchResumes,
  fetchSubscription,
} from "./client";

export const useProfile = () =>
  useQuery({ queryKey: ["profile"], queryFn: fetchProfile });

export const useSubscription = () =>
  useQuery({ queryKey: ["subscription"], queryFn: fetchSubscription });

export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });

export const useResumes = () =>
  useQuery({ queryKey: ["resumes"], queryFn: fetchResumes });

export const useReports = () =>
  useQuery({ queryKey: ["reports"], queryFn: fetchReports });

export const useReportStats = () =>
  useQuery({ queryKey: ["reports", "stats"], queryFn: fetchReportStats });

export const useReportDetail = (id: number | string) =>
  useQuery({
    queryKey: ["reports", "detail", String(id)],
    queryFn: () => fetchReportDetail(id),
  });
