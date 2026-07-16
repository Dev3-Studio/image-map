import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CssBaseline, ThemeProvider } from '@mui/material';
import theme from '@/theme';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Tiling Images",
	description: "Explore a recursively tiled image collage.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={inter.className}><main>
				<ThemeProvider theme={theme}>
					<CssBaseline />
					{children}
				</ThemeProvider>
			</main></body>
		</html>
	);
}
